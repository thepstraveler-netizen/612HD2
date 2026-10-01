import { z } from "zod";
import { BOOKING_STATUSES } from "@/lib/bookings/state";
import { isIsoDate } from "@/lib/dates";
import { optionalLocalizedSchema } from "@/lib/i18n/localized";
import { rupeesToPaise } from "@/lib/money";

/**
 * Admin schemas for Phase 4: the bookings list filters, booking actions,
 * coupons, notification templates and the payment / invoice settings forms.
 * Money is typed in rupees and leaves these schemas as integer paise;
 * percentages are typed as % and stored as basis points by the row mappers
 * in lib/bookings/admin-forms.ts.
 */

export const BOOKING_SERVICES = ["hotel", "cab", "ride", "food", "medicine", "package", "travel"] as const;
export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp"] as const;
export const OFFLINE_METHODS = ["cash", "upi", "card", "bank_transfer", "other"] as const;
export const COUPON_DISCOUNTS = ["percent", "flat"] as const;

const uuid = z.uuid();
const reason = z.string().trim().min(3, { error: "required" }).max(500);

/** Rupees typed in a form → paise. Empty → null. */
const rupees = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => v === "" || rupeesToPaise(v) !== null, { error: "invalidAmount" })
  .transform((v) => (v === "" ? null : rupeesToPaise(v)));
const positiveRupees = rupees
  .refine((v) => v !== null && v > 0, { error: "invalidAmount" })
  .transform((v) => v ?? 0);
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());
/** A percentage with up to two decimals ("12.5"). */
const percentText = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, { error: "invalid" })
  .transform(Number);
/** `datetime-local` already converted to ISO by the client (fromLocalInput); empty → null. */
const optionalInstant = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), { error: "invalid" })
  .transform((v) => (v ? new Date(v).toISOString() : null));

// ---------------------------------------------------------------- bookings list

const isoDate = z.string().refine(isIsoDate);

/**
 * `/admin/bookings?…` query string. Each field is optional and an invalid
 * value is dropped on its own (`catch`), so a hand-edited link still opens.
 */
export const bookingFiltersSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional().catch(undefined),
  service: z.enum(BOOKING_SERVICES).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type BookingFilters = z.output<typeof bookingFiltersSchema>;

// ---------------------------------------------------------------- booking actions

export const bookingIdSchema = z.object({ bookingId: uuid });

export const cancelBookingSchema = z.object({
  bookingId: uuid,
  reason,
  /** Refund to the guest in rupees; 0 for none. */
  refund: rupees.transform((v) => v ?? 0),
});
export type CancelBookingInput = z.input<typeof cancelBookingSchema>;

export const refundBookingSchema = z.object({ bookingId: uuid, reason, amount: positiveRupees });
export type RefundBookingInput = z.input<typeof refundBookingSchema>;

export const offlinePaymentSchema = z.object({
  bookingId: uuid,
  amount: positiveRupees,
  method: z.enum(OFFLINE_METHODS),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
});
export type OfflinePaymentInput = z.input<typeof offlinePaymentSchema>;

// ---------------------------------------------------------------- coupons

export const couponFormSchema = z
  .object({
    id: uuid.optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, { error: "invalidCoupon" }),
    description: optionalLocalizedSchema,
    discount_type: z.enum(COUPON_DISCOUNTS),
    /** percent: "10" or "12.5" (%); flat: rupees. Converted by couponRow(). */
    value: z.union([z.string(), z.number()]).transform((v) =>
      String(v)
        .trim()
        .replace(/[,\s₹%]/g, ""),
    ),
    max_discount: rupees,
    min_order: rupees.transform((v) => v ?? 0),
    services: z.array(z.enum(BOOKING_SERVICES)).max(BOOKING_SERVICES.length).default([]),
    hotel_ids: z.array(uuid).max(200).default([]),
    starts_at: optionalInstant,
    ends_at: optionalInstant,
    usage_limit: optionalInt(1, 10_000_000),
    per_user_limit: z.coerce.number().int().min(1).max(1000),
    first_booking_only: z.boolean(),
    is_public: z.boolean(),
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const ok =
      v.discount_type === "percent"
        ? /^\d{1,3}(\.\d{1,2})?$/.test(v.value) && Number(v.value) > 0 && Number(v.value) <= 100
        : (rupeesToPaise(v.value) ?? 0) > 0;
    if (!ok) ctx.addIssue({ code: "custom", message: "invalidAmount", path: ["value"] });
    if (v.max_discount !== null && v.max_discount <= 0) {
      ctx.addIssue({ code: "custom", message: "invalidAmount", path: ["max_discount"] });
    }
    if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) {
      ctx.addIssue({ code: "custom", message: "endBeforeStart", path: ["ends_at"] });
    }
  });
export type CouponFormInput = z.input<typeof couponFormSchema>;
export type CouponForm = z.output<typeof couponFormSchema>;

export const couponDeleteSchema = z.object({ id: uuid });

// ---------------------------------------------------------------- notification templates

export const templateFormSchema = z
  .object({
    id: uuid.optional(),
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9_.]{3,60}$/, { error: "invalid" }),
    channel: z.enum(NOTIFICATION_CHANNELS),
    locale: z.enum(["en", "hi"]),
    subject: z.string().trim().max(200).default(""),
    body: z.string().trim().min(1, { error: "required" }).max(5000),
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.channel === "email" && !v.subject) {
      ctx.addIssue({ code: "custom", message: "required", path: ["subject"] });
    }
  })
  // Only email has a subject line.
  .transform((v) => ({ ...v, subject: v.channel === "email" ? v.subject : null }));
export type TemplateFormInput = z.input<typeof templateFormSchema>;

// ---------------------------------------------------------------- settings

/** Admin form for `payments.defaults` (rupees and % in; paise and bps out via paymentSettingsValue). */
export const paymentSettingsFormSchema = z.object({
  advance_percent: z.coerce.number().int().min(1).max(99),
  part_payment_enabled: z.boolean(),
  convenience_fee: rupees.transform((v) => v ?? 0).refine((v) => v <= 1_000_000, { error: "invalidAmount" }),
  fee_tax_percent: percentText,
  pay_at_hotel_enabled: z.boolean(),
  hold_minutes: z.coerce.number().int().min(5).max(30),
  customer_cancellation_enabled: z.boolean(),
});
export type PaymentSettingsFormInput = z.input<typeof paymentSettingsFormSchema>;
export type PaymentSettingsForm = z.output<typeof paymentSettingsFormSchema>;

/** Admin form for `business.invoice`; the stored value is re-checked with invoiceSettingsSchema. */
export const invoiceSettingsFormSchema = z.object({
  legal_name: z.string().trim().min(2, { error: "required" }).max(160),
  state: z.string().trim().max(60),
  state_code: z
    .string()
    .trim()
    .regex(/^[0-9]{2}$/, { error: "invalid" }),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, { error: "invalid" }),
  sac_accommodation: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, { error: "invalid" }),
  sac_services: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, { error: "invalid" }),
  terms: z.string().trim().max(500),
});
export type InvoiceSettingsFormInput = z.input<typeof invoiceSettingsFormSchema>;
