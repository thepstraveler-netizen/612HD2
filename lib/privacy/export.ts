import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assembleExport, EXPORT_COLUMNS, type AccountExport, type ExportSources } from "./assemble";

/**
 * Reads everything tied to one user with the service role, every query
 * scoped by that user's id (or by their own bookings / orders), and shapes
 * it with {@link assembleExport}. The caller has already checked the session.
 */

const CHUNK = 200;

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
}

function must<T>(scope: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`[privacy export] ${scope}: ${r.error.message}`);
  return r.data as T;
}

export async function buildAccountExport(userId: string, email: string | null): Promise<AccountExport> {
  const db = createAdminClient();
  const C = EXPORT_COLUMNS;

  const [
    profile,
    addresses,
    travellers,
    wishlists,
    bookings,
    prescriptions,
    reviews,
    ledger,
    referrals,
    leads,
    applications,
    requests,
  ] = await Promise.all([
    db.from("profiles").select(C.profiles).eq("id", userId).maybeSingle(),
    db.from("addresses").select(C.addresses).eq("user_id", userId).order("created_at"),
    db.from("travellers").select(C.travellers).eq("user_id", userId).order("created_at"),
    db.from("wishlists").select(C.wishlists).eq("user_id", userId).order("created_at"),
    db.from("bookings").select(C.bookings).eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("prescriptions").select(C.prescriptions).eq("user_id", userId).order("created_at"),
    db.from("reviews").select(C.reviews).eq("user_id", userId).order("created_at"),
    db.from("loyalty_ledger").select(C.loyalty_ledger).eq("user_id", userId).order("created_at"),
    db
      .from("referrals")
      .select(C.referrals)
      .or(`referrer_id.eq.${userId},referee_id.eq.${userId}`)
      .order("created_at"),
    // Enquiries sent while signed in, plus guest enquiries from the account's email.
    email
      ? db
          .from("leads")
          .select(C.leads)
          .or(`user_id.eq.${userId},email.eq."${email.replace(/["\\]/g, "")}"`)
          .order("created_at")
      : db.from("leads").select(C.leads).eq("user_id", userId).order("created_at"),
    db.from("partner_applications").select(C.partner_applications).eq("user_id", userId).order("created_at"),
    db.from("privacy_requests").select(C.privacy_requests).eq("user_id", userId).order("created_at"),
  ]);

  const bookingRows = must("bookings", bookings) ?? [];
  const bookingIds = bookingRows.map((b) => b.id);
  const perBooking = await Promise.all(
    chunks(bookingIds).map((ids) =>
      Promise.all([
        db.from("booking_items").select(C.booking_items).in("booking_id", ids),
        db.from("booking_guests").select(C.booking_guests).in("booking_id", ids),
        db.from("payments").select(C.payments).in("booking_id", ids).order("created_at"),
        db.from("refunds").select(C.refunds).in("booking_id", ids).order("created_at"),
        db.from("orders").select(C.orders).in("booking_id", ids),
      ]),
    ),
  );
  const bookingItems: ExportSources["bookingItems"] = [];
  const bookingGuests: ExportSources["bookingGuests"] = [];
  const payments: ExportSources["payments"] = [];
  const refunds: ExportSources["refunds"] = [];
  const orders: ExportSources["orders"] = [];
  for (const [i, g, p, r, o] of perBooking) {
    bookingItems.push(...(must("booking items", i) ?? []));
    bookingGuests.push(...(must("booking guests", g) ?? []));
    payments.push(...(must("payments", p) ?? []));
    refunds.push(...(must("refunds", r) ?? []));
    orders.push(...(must("orders", o) ?? []));
  }
  const orderItems: ExportSources["orderItems"] = [];
  for (const ids of chunks(orders.map((o) => o.id))) {
    orderItems.push(
      ...(must("order items", await db.from("order_items").select(C.order_items).in("order_id", ids)) ?? []),
    );
  }

  return assembleExport(
    userId,
    {
      profile: must("profile", profile),
      addresses: must("addresses", addresses) ?? [],
      travellers: must("travellers", travellers) ?? [],
      wishlists: must("wishlist", wishlists) ?? [],
      bookings: bookingRows,
      bookingItems,
      bookingGuests,
      payments,
      refunds,
      orders,
      orderItems,
      prescriptions: must("prescriptions", prescriptions) ?? [],
      reviews: must("reviews", reviews) ?? [],
      loyaltyLedger: must("loyalty", ledger) ?? [],
      referrals: must("referrals", referrals) ?? [],
      leads: must("leads", leads) ?? [],
      partnerApplications: must("partner applications", applications) ?? [],
      privacyRequests: must("privacy requests", requests) ?? [],
    },
    new Date(),
  );
}
