import type { Database, Json, Tables } from "@/types/database";

/**
 * "Download my data" (DPDP, D-095): shapes the rows read for one user into
 * the JSON file they download. Pure, so what is left out is unit-tested:
 * gateway ids and raw payloads, delivery-partner tokens and OTPs, storage
 * paths of prescriptions and partner documents, staff ids and staff-only
 * notes, and the other person in a referral.
 */

export const EXPORT_FORMAT_VERSION = 1;

type Row<T extends keyof Database["public"]["Tables"], K extends keyof Tables<T>> = Pick<Tables<T>, K>;

export const EXPORT_COLUMNS = {
  profiles:
    "id, email, full_name, phone, avatar_url, preferred_locale, referral_code, created_at, updated_at",
  addresses:
    "id, label, contact_name, phone, line1, line2, landmark, pincode, lat, lng, is_default, created_at, updated_at",
  travellers: "id, full_name, relation, date_of_birth, gender, phone, is_default, created_at, updated_at",
  wishlists: "subject_type, subject_id, created_at",
  bookings:
    "id, code, service, status, check_in, check_out, rooms, adults, children, contact_name, contact_email, contact_phone, special_requests, gst_details, subtotal_paise, discount_paise, tax_paise, total_paise, paid_paise, refunded_paise, payment_mode, coupon_code, locale, confirmed_at, completed_at, cancelled_at, cancel_reason, created_at",
  booking_items:
    "booking_id, kind, description, service_date, quantity, amount_paise, discount_paise, tax_rate_bps, tax_paise, sac, sort_order",
  booking_guests: "booking_id, full_name, is_child, is_primary, sort_order",
  payments: "booking_id, provider, amount_paise, status, method, captured_at, created_at",
  refunds: "booking_id, amount_paise, status, reason, processed_at, created_at",
  orders:
    "id, booking_id, kind, address, status, placed_at, delivered_at, rating, rating_comment, rated_at, created_at",
  order_items:
    "order_id, name, variant_name, addons, quantity, unit_price_paise, line_total_paise, sort_order",
  prescriptions:
    "id, patient_name, patient_age, phone, address, files, notes, status, created_at, updated_at",
  reviews:
    "id, booking_id, subject_type, service, rating, title, body, author_name, locale, status, reply, replied_at, created_at, updated_at",
  loyalty_ledger: "kind, points, booking_id, note, expires_at, created_at",
  referrals: "referrer_id, referee_id, code, status, rewarded_at, created_at",
  leads:
    "number, kind, service_slug, name, phone, email, details, message, status, source, locale, created_at",
  partner_applications:
    "number, business_type, business_name, contact_name, phone, email, city, address, gstin, pan, website, details, message, documents, agreement_version, agreement_name, agreement_accepted_at, status, review_note, reviewed_at, created_at",
  privacy_requests: "kind, status, reason, note, processed_at, created_at",
} as const;

export type ExportSources = {
  profile: Row<
    "profiles",
    | "id"
    | "email"
    | "full_name"
    | "phone"
    | "avatar_url"
    | "preferred_locale"
    | "referral_code"
    | "created_at"
    | "updated_at"
  > | null;
  addresses: Row<
    "addresses",
    | "id"
    | "label"
    | "contact_name"
    | "phone"
    | "line1"
    | "line2"
    | "landmark"
    | "pincode"
    | "lat"
    | "lng"
    | "is_default"
    | "created_at"
    | "updated_at"
  >[];
  travellers: Row<
    "travellers",
    | "id"
    | "full_name"
    | "relation"
    | "date_of_birth"
    | "gender"
    | "phone"
    | "is_default"
    | "created_at"
    | "updated_at"
  >[];
  wishlists: Row<"wishlists", "subject_type" | "subject_id" | "created_at">[];
  bookings: Row<
    "bookings",
    | "id"
    | "code"
    | "service"
    | "status"
    | "check_in"
    | "check_out"
    | "rooms"
    | "adults"
    | "children"
    | "contact_name"
    | "contact_email"
    | "contact_phone"
    | "special_requests"
    | "gst_details"
    | "subtotal_paise"
    | "discount_paise"
    | "tax_paise"
    | "total_paise"
    | "paid_paise"
    | "refunded_paise"
    | "payment_mode"
    | "coupon_code"
    | "locale"
    | "confirmed_at"
    | "completed_at"
    | "cancelled_at"
    | "cancel_reason"
    | "created_at"
  >[];
  bookingItems: Row<
    "booking_items",
    | "booking_id"
    | "kind"
    | "description"
    | "service_date"
    | "quantity"
    | "amount_paise"
    | "discount_paise"
    | "tax_rate_bps"
    | "tax_paise"
    | "sac"
    | "sort_order"
  >[];
  bookingGuests: Row<
    "booking_guests",
    "booking_id" | "full_name" | "is_child" | "is_primary" | "sort_order"
  >[];
  payments: Row<
    "payments",
    "booking_id" | "provider" | "amount_paise" | "status" | "method" | "captured_at" | "created_at"
  >[];
  refunds: Row<
    "refunds",
    "booking_id" | "amount_paise" | "status" | "reason" | "processed_at" | "created_at"
  >[];
  orders: Row<
    "orders",
    | "id"
    | "booking_id"
    | "kind"
    | "address"
    | "status"
    | "placed_at"
    | "delivered_at"
    | "rating"
    | "rating_comment"
    | "rated_at"
    | "created_at"
  >[];
  orderItems: Row<
    "order_items",
    | "order_id"
    | "name"
    | "variant_name"
    | "addons"
    | "quantity"
    | "unit_price_paise"
    | "line_total_paise"
    | "sort_order"
  >[];
  prescriptions: Row<
    "prescriptions",
    | "id"
    | "patient_name"
    | "patient_age"
    | "phone"
    | "address"
    | "files"
    | "notes"
    | "status"
    | "created_at"
    | "updated_at"
  >[];
  reviews: Row<
    "reviews",
    | "id"
    | "booking_id"
    | "subject_type"
    | "service"
    | "rating"
    | "title"
    | "body"
    | "author_name"
    | "locale"
    | "status"
    | "reply"
    | "replied_at"
    | "created_at"
    | "updated_at"
  >[];
  loyaltyLedger: Row<
    "loyalty_ledger",
    "kind" | "points" | "booking_id" | "note" | "expires_at" | "created_at"
  >[];
  referrals: Row<
    "referrals",
    "referrer_id" | "referee_id" | "code" | "status" | "rewarded_at" | "created_at"
  >[];
  leads: Row<
    "leads",
    | "number"
    | "kind"
    | "service_slug"
    | "name"
    | "phone"
    | "email"
    | "details"
    | "message"
    | "status"
    | "source"
    | "locale"
    | "created_at"
  >[];
  partnerApplications: Row<
    "partner_applications",
    | "number"
    | "business_type"
    | "business_name"
    | "contact_name"
    | "phone"
    | "email"
    | "city"
    | "address"
    | "gstin"
    | "pan"
    | "website"
    | "details"
    | "message"
    | "documents"
    | "agreement_version"
    | "agreement_name"
    | "agreement_accepted_at"
    | "status"
    | "review_note"
    | "reviewed_at"
    | "created_at"
  >[];
  privacyRequests: Row<
    "privacy_requests",
    "kind" | "status" | "reason" | "note" | "processed_at" | "created_at"
  >[];
};

const byKey = <T, K extends string>(rows: readonly T[], key: (row: T) => K | null) => {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
};

function omit<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
}

const bySort = <T extends { sort_order: number }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => a.sort_order - b.sort_order);

/** Partner documents: the type and file name the applicant gave, never the storage path. */
function documentSummary(documents: Json): { kind: string | null; name: string | null }[] {
  if (!Array.isArray(documents)) return [];
  return documents.map((d) => {
    const o = d && typeof d === "object" && !Array.isArray(d) ? d : {};
    const str = (v: Json | undefined) => (typeof v === "string" ? v : null);
    return { kind: str(o.kind), name: str(o.name) };
  });
}

export function assembleExport(userId: string, src: ExportSources, generatedAt: Date) {
  const items = byKey(src.bookingItems, (r) => r.booking_id);
  const guests = byKey(src.bookingGuests, (r) => r.booking_id);
  const payments = byKey(src.payments, (r) => r.booking_id);
  const refunds = byKey(src.refunds, (r) => r.booking_id);
  const ordersByBooking = byKey(src.orders, (r) => r.booking_id);
  const orderItems = byKey(src.orderItems, (r) => r.order_id);

  return {
    format: "ps-traveler-account-export",
    version: EXPORT_FORMAT_VERSION,
    generated_at: generatedAt.toISOString(),
    user_id: userId,
    notes: [
      "Amounts are in paise (1 rupee = 100 paise).",
      "Card, UPI and bank details are held by the payment gateway, never by P&S Traveler, so they are not included.",
      "Prescription images and partner documents are listed by count or name; download them from your account.",
    ],
    profile: src.profile,
    addresses: src.addresses,
    travellers: src.travellers,
    wishlist: src.wishlists,
    bookings: src.bookings.map((b) => ({
      ...b,
      items: bySort(items.get(b.id) ?? []).map((r) => omit(r, "booking_id", "sort_order")),
      guests: bySort(guests.get(b.id) ?? []).map((r) => omit(r, "booking_id", "sort_order")),
      payments: (payments.get(b.id) ?? []).map((r) => omit(r, "booking_id")),
      refunds: (refunds.get(b.id) ?? []).map((r) => omit(r, "booking_id")),
      orders: (ordersByBooking.get(b.id) ?? []).map((order) => ({
        ...omit(order, "booking_id"),
        items: bySort(orderItems.get(order.id) ?? []).map((r) => omit(r, "order_id", "sort_order")),
      })),
    })),
    prescriptions: src.prescriptions.map(({ files, ...p }) => ({ ...p, file_count: files.length })),
    reviews: src.reviews,
    loyalty_ledger: src.loyaltyLedger,
    points_balance: src.loyaltyLedger.reduce((sum, l) => sum + l.points, 0),
    referrals: src.referrals.map((r) => ({
      role: r.referrer_id === userId ? "referrer" : "referee",
      code: r.code,
      status: r.status,
      rewarded_at: r.rewarded_at,
      created_at: r.created_at,
    })),
    enquiries: src.leads,
    partner_applications: src.partnerApplications.map(({ documents, ...a }) => ({
      ...a,
      documents: documentSummary(documents),
    })),
    privacy_requests: src.privacyRequests,
  };
}

export type AccountExport = ReturnType<typeof assembleExport>;

/** `ps-traveler-data-2026-10-03.json` */
export function exportFileName(generatedAt: Date): string {
  return `ps-traveler-data-${generatedAt.toISOString().slice(0, 10)}.json`;
}
