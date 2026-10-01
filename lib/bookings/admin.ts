import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BookingFilters } from "@/schemas/booking-admin";
import type { Tables } from "@/types/database";
import { bookingSearchFilter, couponUsage, searchTerm } from "./admin-forms";

/**
 * Admin reads for bookings, payments, coupons and notifications. They run
 * as the signed-in user, so RLS decides what is visible (bookings.read,
 * payments.read, offers.read, notifications.read); a viewer without
 * payments.read simply sees no payment rows. Uncached and flat: joins
 * happen here in memory.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[bookings admin] ${scope}: ${error.message}`);
}

export const BOOKINGS_PAGE_SIZE = 25;
const LOG_LIMIT = 200;

// ---------------------------------------------------------------- bookings

export type AdminBookingListRow = Pick<
  Tables<"bookings">,
  | "id"
  | "code"
  | "service"
  | "status"
  | "contact_name"
  | "contact_phone"
  | "check_in"
  | "check_out"
  | "total_paise"
  | "paid_paise"
  | "payment_mode"
  | "snapshot"
  | "created_at"
>;

export async function listAdminBookings(
  filters: BookingFilters,
): Promise<{ rows: AdminBookingListRow[]; total: number }> {
  const supabase = await createClient();
  const from = (filters.page - 1) * BOOKINGS_PAGE_SIZE;
  let query = supabase
    .from("bookings")
    .select(
      "id, code, service, status, contact_name, contact_phone, check_in, check_out, total_paise, paid_paise, payment_mode, snapshot, created_at",
      { count: "exact" },
    );
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.service) query = query.eq("service", filters.service);
  if (filters.from) query = query.gte("check_in", filters.from);
  if (filters.to) query = query.lte("check_in", filters.to);
  const term = searchTerm(filters.q);
  if (term) query = query.or(bookingSearchFilter(term));
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + BOOKINGS_PAGE_SIZE - 1);
  if (error) fail("bookings", error);
  return { rows: data, total: count ?? data.length };
}

export type AdminBookingDetail = {
  booking: Tables<"bookings">;
  items: Tables<"booking_items">[];
  guests: Tables<"booking_guests">[];
  payments: Tables<"payments">[];
  refunds: Tables<"refunds">[];
  invoice: Pick<Tables<"invoices">, "number" | "issued_at"> | null;
  notifications: Tables<"notification_logs">[];
};

export async function getAdminBooking(id: string): Promise<AdminBookingDetail | null> {
  const supabase = await createClient();
  const { data: booking, error } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) fail("booking", error);
  if (!booking) return null;
  const [items, guests, payments, refunds, invoice, notifications] = await Promise.all([
    supabase.from("booking_items").select("*").eq("booking_id", id).order("sort_order").order("service_date"),
    supabase.from("booking_guests").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("payments").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("refunds").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("invoices").select("number, issued_at").eq("booking_id", id).maybeSingle(),
    supabase
      .from("notification_logs")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (items.error) fail("items", items.error);
  if (guests.error) fail("guests", guests.error);
  if (payments.error) fail("payments", payments.error);
  if (refunds.error) fail("refunds", refunds.error);
  if (invoice.error) fail("invoice", invoice.error);
  if (notifications.error) fail("notifications", notifications.error);
  return {
    booking,
    items: items.data,
    guests: guests.data,
    payments: payments.data,
    refunds: refunds.data,
    invoice: invoice.data,
    notifications: notifications.data,
  };
}

/** Booking codes by id, for linking payment rows to their booking. */
async function bookingCodes(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select("id, code").in("id", unique);
  if (error) fail("booking codes", error);
  return new Map(data.map((b) => [b.id, b.code]));
}

// ---------------------------------------------------------------- payments

export type WithBookingCode<T> = T & { booking_code: string | null };

export async function listAdminPayments(): Promise<WithBookingCode<Tables<"payments">>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) fail("payments", error);
  const codes = await bookingCodes(data.map((p) => p.booking_id));
  return data.map((p) => ({ ...p, booking_code: codes.get(p.booking_id) ?? null }));
}

export async function listAdminRefunds(): Promise<WithBookingCode<Tables<"refunds">>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) fail("refunds", error);
  const codes = await bookingCodes(data.map((r) => r.booking_id));
  return data.map((r) => ({ ...r, booking_code: codes.get(r.booking_id) ?? null }));
}

export async function listPaymentEvents(): Promise<WithBookingCode<Tables<"payment_events">>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) fail("payment events", error);
  const codes = await bookingCodes(data.flatMap((e) => (e.booking_id ? [e.booking_id] : [])));
  return data.map((e) => ({ ...e, booking_code: e.booking_id ? (codes.get(e.booking_id) ?? null) : null }));
}

// ---------------------------------------------------------------- coupons

export type AdminCouponRow = Tables<"coupons"> & { used: number };

export async function listAdminCoupons(): Promise<AdminCouponRow[]> {
  const supabase = await createClient();
  const [coupons, redemptions] = await Promise.all([
    supabase.from("coupons").select("*").order("created_at", { ascending: false }),
    supabase.from("coupon_redemptions").select("coupon_id, status").in("status", ["reserved", "redeemed"]),
  ]);
  if (coupons.error) fail("coupons", coupons.error);
  if (redemptions.error) fail("redemptions", redemptions.error);
  const usage = couponUsage(redemptions.data);
  return coupons.data.map((c) => ({ ...c, used: usage.get(c.id) ?? 0 }));
}

export async function getAdminCoupon(id: string): Promise<AdminCouponRow | null> {
  const supabase = await createClient();
  const [coupon, redemptions] = await Promise.all([
    supabase.from("coupons").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("coupon_redemptions")
      .select("coupon_id, status")
      .eq("coupon_id", id)
      .in("status", ["reserved", "redeemed"]),
  ]);
  if (coupon.error) fail("coupon", coupon.error);
  if (redemptions.error) fail("redemptions", redemptions.error);
  return coupon.data ? { ...coupon.data, used: redemptions.data.length } : null;
}

/** Hotels a coupon can be limited to (staff with offers.read may not have hotels.read: then none). */
export async function listCouponHotelOptions(): Promise<Pick<Tables<"hotels">, "id" | "name">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotels")
    .select("id, name")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) fail("hotels", error);
  return data;
}

// ---------------------------------------------------------------- notifications

export async function listNotificationTemplates(): Promise<Tables<"notification_templates">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_templates")
    .select("*")
    .order("key")
    .order("channel")
    .order("locale");
  if (error) fail("templates", error);
  return data;
}

export async function getNotificationTemplate(id: string): Promise<Tables<"notification_templates"> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("template", error);
  return data;
}

export async function listNotificationLogs(): Promise<WithBookingCode<Tables<"notification_logs">>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) fail("notification logs", error);
  const codes = await bookingCodes(data.flatMap((l) => (l.booking_id ? [l.booking_id] : [])));
  return data.map((l) => ({ ...l, booking_code: l.booking_id ? (codes.get(l.booking_id) ?? null) : null }));
}
