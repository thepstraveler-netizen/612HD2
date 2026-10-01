import { z } from "zod";
import { canTransition, balanceDue, type BookingStatus } from "@/lib/bookings/state";
import { percentToBps } from "@/lib/hotels/admin-rows";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { formatPaise, paiseToRupeesInput, rupeesToPaise } from "@/lib/money";
import type { PermissionKey } from "@/lib/permissions/constants";
import { checkInInstant, quoteRefund, type RefundQuote } from "@/lib/refunds/policy";
import {
  bookingFiltersSchema,
  type BookingFilters,
  type CouponForm,
  type CouponFormInput,
  type InvoiceSettingsFormInput,
  type PaymentSettingsForm,
  type PaymentSettingsFormInput,
} from "@/schemas/booking-admin";
import type { InvoiceSettings, PaymentSettings } from "@/schemas/booking";
import { cancellationRulesSchema } from "@/schemas/hotels";
import type { Json, Tables, TablesInsert } from "@/types/database";

/**
 * Pure helpers behind the bookings, payments, coupons and settings admin:
 * form ↔ row mapping (rupees ↔ paise, % ↔ basis points), list filters and
 * which booking actions to offer. Unit-tested; the server code only reads
 * and writes.
 */

// ---------------------------------------------------------------- bookings list

/** Reads Next's `searchParams` (string | string[]) into list filters. */
export function parseBookingFilters(raw: Record<string, string | string[] | undefined>): BookingFilters {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") flat[key] = v;
  }
  const filters = bookingFiltersSchema.parse(flat);
  // A reversed range is read as the user meant it.
  if (filters.from && filters.to && filters.from > filters.to) {
    return { ...filters, from: filters.to, to: filters.from };
  }
  return filters;
}

/** Query string for the list (page 1 omitted), e.g. `?status=confirmed&page=2`. */
export function bookingFiltersQuery(filters: Partial<BookingFilters>, page = 1): string {
  const params = new URLSearchParams();
  for (const key of ["status", "service", "from", "to", "q"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Free text for a PostgREST `or=(…ilike…)` filter: characters that carry
 * meaning in that syntax (`,()*%\:"`) are dropped so input cannot add
 * conditions. Returns null when nothing searchable is left.
 */
export function searchTerm(q: string | undefined): string | null {
  if (!q) return null;
  const term = q
    .replace(/[,()*%\\:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return term.length >= 2 ? term : null;
}

/** A phone search ignores spaces and dashes the way numbers are stored (`+919876543210`). */
export function bookingSearchFilter(term: string): string {
  const digits = term.replace(/[\s-]/g, "");
  const parts = [`code.ilike.*${term.toUpperCase()}*`, `contact_name.ilike.*${term}*`];
  if (/^\+?\d{3,15}$/.test(digits)) parts.push(`contact_phone.ilike.*${digits}*`);
  return parts.join(",");
}

// ---------------------------------------------------------------- snapshot

const snapshotSchema = z.object({
  hotel: z
    .object({
      name: z.object({ en: z.string(), hi: z.string().nullish() }).optional(),
      checkInTime: z.string().optional(),
      checkOutTime: z.string().optional(),
    })
    .optional(),
  room: z.object({ name: z.object({ en: z.string(), hi: z.string().nullish() }).optional() }).optional(),
  plan: z
    .object({
      name: z.object({ en: z.string(), hi: z.string().nullish() }).optional(),
      isRefundable: z.boolean().optional(),
      cancellationRules: cancellationRulesSchema.optional(),
    })
    .optional(),
});
export type BookingSnapshot = z.output<typeof snapshotSchema>;

/** The hotel/room/plan the guest booked, read defensively from the stored JSON. */
export function readSnapshot(value: unknown): BookingSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function snapshotName(name: LocalizedJson | undefined, locale: string): string {
  return name ? pickLocalized(name, locale) : "";
}

// ---------------------------------------------------------------- booking actions

type MoneyState = Pick<Tables<"bookings">, "status" | "total_paise" | "paid_paise" | "refunded_paise">;

/** What can still be refunded: money received minus money already returned. */
export function refundable(b: Pick<MoneyState, "paid_paise" | "refunded_paise">): number {
  return Math.max(0, b.paid_paise - b.refunded_paise);
}

/**
 * The cancellation policy's refund for a staff cancellation now. Staff may
 * change it (0 … refundable) in the dialog; this is only the suggestion.
 */
export function suggestedRefund(
  b: MoneyState & Pick<Tables<"bookings">, "check_in" | "snapshot">,
  now: Date,
): RefundQuote {
  const snapshot = readSnapshot(b.snapshot);
  const checkInAt = b.check_in
    ? checkInInstant(b.check_in, snapshot.hotel?.checkInTime ?? "12:00")
    : new Date(now.getTime());
  return quoteRefund({
    rules: snapshot.plan?.cancellationRules ?? [],
    isRefundable: snapshot.plan?.isRefundable ?? false,
    checkInAt,
    now,
    totalPaise: b.total_paise,
    paidPaise: b.paid_paise,
    refundedPaise: b.refunded_paise,
  });
}

export const BOOKING_ACTIONS = [
  "cancel",
  "refund",
  "complete",
  "offlinePayment",
  "paymentLink",
  "resendConfirmation",
] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

/**
 * Actions offered for a booking: valid for its status (state machine and
 * the SQL guards agree) and allowed by the viewer's permissions.
 */
export function availableBookingActions(
  b: MoneyState,
  can: (permission: PermissionKey) => boolean,
  options: { paymentLinks: boolean },
): BookingAction[] {
  const status = b.status as BookingStatus;
  const live = status === "confirmed" || status === "completed";
  const balance = balanceDue({ totalPaise: b.total_paise, paidPaise: b.paid_paise });
  const actions: BookingAction[] = [];
  if (can("bookings.write") && canTransition(status, "cancelled")) actions.push("cancel");
  if (
    can("payments.refund") &&
    refundable(b) > 0 &&
    (canTransition(status, "partially_refunded") || canTransition(status, "refunded"))
  ) {
    actions.push("refund");
  }
  if (can("bookings.write") && canTransition(status, "completed")) actions.push("complete");
  if (can("payments.write") && live && balance > 0) actions.push("offlinePayment");
  if (can("payments.write") && live && balance > 0 && options.paymentLinks) actions.push("paymentLink");
  if (can("bookings.write") && live) actions.push("resendConfirmation");
  return actions;
}

// ---------------------------------------------------------------- coupons

/** Validated coupon form → `coupons` row: % → basis points, rupees → paise. */
export function couponRow(form: CouponForm): TablesInsert<"coupons"> {
  const value =
    form.discount_type === "percent" ? percentToBps(Number(form.value)) : (rupeesToPaise(form.value) ?? 0);
  return {
    code: form.code,
    description: form.description,
    discount_type: form.discount_type,
    value,
    // A cap only makes sense for a percentage.
    max_discount_paise: form.discount_type === "percent" ? form.max_discount : null,
    min_order_paise: form.min_order,
    services: [...new Set(form.services)],
    hotel_ids: [...new Set(form.hotel_ids)],
    starts_at: form.starts_at,
    ends_at: form.ends_at,
    usage_limit: form.usage_limit,
    per_user_limit: form.per_user_limit,
    first_booking_only: form.first_booking_only,
    is_public: form.is_public,
    is_active: form.is_active,
  };
}

/** Stored bps (1250) → form text ("12.5"). */
export function bpsToPercentInput(bps: number): string {
  const n = bps / 100;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export const EMPTY_COUPON_FORM: CouponFormInput = {
  code: "",
  description: { en: "", hi: "" },
  discount_type: "percent",
  value: "",
  max_discount: "",
  min_order: "",
  services: [],
  hotel_ids: [],
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  per_user_limit: 1,
  first_booking_only: false,
  is_public: false,
  is_active: true,
};

/** Stored coupon → form values (dates stay ISO; the client form shows them in local time). */
export function couponFormValues(row: Tables<"coupons">): CouponFormInput {
  return {
    id: row.id,
    code: row.code,
    description: { en: row.description?.en ?? "", hi: row.description?.hi ?? "" },
    discount_type: row.discount_type,
    value: row.discount_type === "percent" ? bpsToPercentInput(row.value) : paiseToRupeesInput(row.value),
    max_discount: paiseToRupeesInput(row.max_discount_paise),
    min_order: row.min_order_paise ? paiseToRupeesInput(row.min_order_paise) : "",
    services: row.services,
    hotel_ids: row.hotel_ids,
    starts_at: row.starts_at ?? "",
    ends_at: row.ends_at ?? "",
    usage_limit: row.usage_limit === null ? "" : String(row.usage_limit),
    per_user_limit: row.per_user_limit,
    first_booking_only: row.first_booking_only,
    is_public: row.is_public,
    is_active: row.is_active,
  };
}

/** "10% (max ₹500)" or "₹200 off" style label parts for lists. */
export function couponValueLabel(
  row: Pick<Tables<"coupons">, "discount_type" | "value" | "max_discount_paise">,
  locale: string,
): { value: string; cap: string | null } {
  if (row.discount_type === "percent") {
    return {
      value: `${bpsToPercentInput(row.value)}%`,
      cap: row.max_discount_paise ? formatPaise(row.max_discount_paise, locale) : null,
    };
  }
  return { value: formatPaise(row.value, locale), cap: null };
}

/** Redemptions that count against a coupon's limit (reserved or redeemed), per coupon. */
export function couponUsage(
  rows: readonly Pick<Tables<"coupon_redemptions">, "coupon_id" | "status">[],
): Map<string, number> {
  const usage = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "released") continue;
    usage.set(r.coupon_id, (usage.get(r.coupon_id) ?? 0) + 1);
  }
  return usage;
}

// ---------------------------------------------------------------- settings

/** Payment settings form → stored `payments.defaults` value (paise and basis points). */
export function paymentSettingsValue(form: PaymentSettingsForm): PaymentSettings {
  return {
    advance_percent: form.advance_percent,
    part_payment_enabled: form.part_payment_enabled,
    convenience_fee_paise: form.convenience_fee,
    fee_tax_bps: percentToBps(form.fee_tax_percent),
    pay_at_hotel_enabled: form.pay_at_hotel_enabled,
    hold_minutes: form.hold_minutes,
    customer_cancellation_enabled: form.customer_cancellation_enabled,
  };
}

export function paymentSettingsFormValues(s: PaymentSettings): PaymentSettingsFormInput {
  return {
    advance_percent: s.advance_percent,
    part_payment_enabled: s.part_payment_enabled,
    convenience_fee: s.convenience_fee_paise ? paiseToRupeesInput(s.convenience_fee_paise) : "0",
    fee_tax_percent: bpsToPercentInput(s.fee_tax_bps),
    pay_at_hotel_enabled: s.pay_at_hotel_enabled,
    hold_minutes: s.hold_minutes,
    customer_cancellation_enabled: s.customer_cancellation_enabled,
  };
}

export function invoiceSettingsFormValues(s: InvoiceSettings): InvoiceSettingsFormInput {
  return { ...s };
}

/** A settings row's new value: the form's keys over what is stored, so unknown keys survive. */
export function mergeSettingValue(
  stored: Json | undefined,
  value: { [key: string]: Json | undefined },
): { [key: string]: Json | undefined } {
  const base = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return { ...base, ...value };
}

// ---------------------------------------------------------------- notifications

/** Sample values for the template editor's live preview. */
export function samplePlaceholderValues(locale: "en" | "hi", site: string): Record<string, string> {
  const hi = locale === "hi";
  return {
    name: hi ? "राधा शर्मा" : "Radha Sharma",
    code: "PS7K3Q9XD2",
    hotel: hi ? "श्री कृष्णा धाम" : "Shri Krishna Dham",
    check_in: "2026-11-14",
    check_out: "2026-11-16",
    rooms: "1",
    guests: "2",
    total: formatPaise(560_000, locale),
    paid: formatPaise(140_000, locale),
    balance: formatPaise(420_000, locale),
    refund: formatPaise(140_000, locale),
    amount: formatPaise(420_000, locale),
    link: "https://rzp.io/i/sample",
    trip_url: `${site.replace(/\/$/, "")}${hi ? "/hi" : ""}/account/trips/PS7K3Q9XD2`,
  };
}
