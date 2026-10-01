import "server-only";
import type { CancellationRule } from "@/lib/availability/engine";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/** The guest's own bookings, read through RLS with their session. */

export type BookingSnapshot = {
  hotel?: {
    slug?: string;
    name?: LocalizedJson;
    address?: string | null;
    checkInTime?: string;
    checkOutTime?: string;
  };
  room?: { name?: LocalizedJson };
  plan?: {
    name?: LocalizedJson;
    mealPlan?: string;
    inclusions?: LocalizedJson[];
    isRefundable?: boolean;
    cancellationRules?: CancellationRule[];
  };
};

export type TripSummary = Pick<
  Tables<"bookings">,
  | "code"
  | "status"
  | "check_in"
  | "check_out"
  | "rooms"
  | "adults"
  | "children"
  | "total_paise"
  | "created_at"
> & { snapshot: BookingSnapshot };

export async function listMyTrips(userId: string, limit = 50): Promise<TripSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("code, status, check_in, check_out, rooms, adults, children, total_paise, created_at, snapshot")
    .eq("user_id", userId)
    .not("status", "eq", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((b) => ({ ...b, snapshot: b.snapshot as BookingSnapshot }));
}

export async function getMyTrip(userId: string, code: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("code", code)
    .eq("user_id", userId)
    .maybeSingle();
  if (!booking) return null;
  const [items, guests, payments, refunds, invoice] = await Promise.all([
    supabase.from("booking_items").select("*").eq("booking_id", booking.id).order("sort_order"),
    supabase
      .from("booking_guests")
      .select("full_name, is_child, is_primary")
      .eq("booking_id", booking.id)
      .order("sort_order"),
    supabase
      .from("payments")
      .select("id, provider, amount_paise, status, method, captured_at, created_at, payment_link_url")
      .eq("booking_id", booking.id)
      .order("created_at"),
    supabase
      .from("refunds")
      .select("amount_paise, status, created_at, processed_at")
      .eq("booking_id", booking.id)
      .order("created_at"),
    supabase.from("invoices").select("number, issued_at").eq("booking_id", booking.id).maybeSingle(),
  ]);
  return {
    booking: { ...booking, snapshot: booking.snapshot as BookingSnapshot },
    items: items.data ?? [],
    guests: guests.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    invoice: invoice.data,
  };
}
