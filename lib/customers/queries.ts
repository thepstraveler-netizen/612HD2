import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CustomerFilters } from "@/schemas/engagement-admin";
import type { Database, Tables } from "@/types/database";
import { customerSearchArgs, parseCustomerSummary, type CustomerSummary } from "./rows";

/**
 * Admin → Customers reads. Profiles, bookings, points, referrals and reviews
 * are read with the service role after {@link assertPermission} for
 * customers.read (the list is filtered, counted and paged in Postgres by
 * public.admin_customers). Staff notes are read as the signed-in user so RLS
 * applies to them as it does to their writes.
 */

export const CUSTOMERS_PAGE_SIZE = 25;
const DETAIL_LIMIT = 50;

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[customers admin] ${scope}: ${error.message}`);
}

export type CustomerListRow = Database["public"]["Functions"]["admin_customers"]["Returns"][number];

export async function listCustomers(
  filters: CustomerFilters,
): Promise<{ rows: CustomerListRow[]; total: number }> {
  await assertPermission("customers.read");
  const { data, error } = await createAdminClient().rpc(
    "admin_customers",
    customerSearchArgs(filters, CUSTOMERS_PAGE_SIZE),
  );
  if (error) fail("list", error);
  const rows = data ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export type CustomerDetail = {
  profile: Tables<"profiles">;
  roles: string[];
  summary: CustomerSummary;
  bookings: Pick<
    Tables<"bookings">,
    "id" | "code" | "service" | "status" | "total_paise" | "paid_paise" | "refunded_paise" | "created_at"
  >[];
  ledger: Pick<
    Tables<"loyalty_ledger">,
    "id" | "kind" | "points" | "note" | "booking_id" | "created_by" | "created_at"
  >[];
  referrals: (Pick<Tables<"referrals">, "id" | "status" | "code" | "rewarded_at" | "created_at"> & {
    role: "referrer" | "referee";
    otherId: string;
  })[];
  reviews: Pick<
    Tables<"reviews">,
    "id" | "rating" | "title" | "status" | "service" | "subject_type" | "created_at"
  >[];
  notes: Pick<Tables<"customer_notes">, "id" | "body" | "created_by" | "created_at">[];
  /** Display names for staff and referred friends that appear on the page. */
  names: Map<string, string>;
};

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  await assertPermission("customers.read");
  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) fail("profile", error);
  if (!profile) return null;

  const supabase = await createClient();
  const [roles, summary, bookings, ledger, referrals, reviews, notes] = await Promise.all([
    admin.from("user_roles").select("roles(key)").eq("user_id", id),
    admin.rpc("admin_customer_summary", { p_user: id }),
    admin
      .from("bookings")
      .select("id, code, service, status, total_paise, paid_paise, refunded_paise, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
    admin
      .from("loyalty_ledger")
      .select("id, kind, points, note, booking_id, created_by, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
    admin
      .from("referrals")
      .select("id, status, code, rewarded_at, created_at, referrer_id, referee_id")
      .or(`referrer_id.eq.${id},referee_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
    admin
      .from("reviews")
      .select("id, rating, title, status, service, subject_type, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
    supabase
      .from("customer_notes")
      .select("id, body, created_by, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
  ]);
  for (const [scope, r] of [
    ["roles", roles],
    ["summary", summary],
    ["bookings", bookings],
    ["ledger", ledger],
    ["referrals", referrals],
    ["reviews", reviews],
    ["notes", notes],
  ] as const) {
    if (r.error) fail(scope, r.error);
  }

  const referralRows = (referrals.data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    code: r.code,
    rewarded_at: r.rewarded_at,
    created_at: r.created_at,
    role: r.referrer_id === id ? ("referrer" as const) : ("referee" as const),
    otherId: r.referrer_id === id ? r.referee_id : r.referrer_id,
  }));
  const people = [
    ...referralRows.map((r) => r.otherId),
    ...(notes.data ?? []).map((n) => n.created_by),
    ...(ledger.data ?? []).map((l) => l.created_by),
  ].filter((v): v is string => Boolean(v));
  const names = new Map<string, string>();
  const wanted = [...new Set(people)];
  if (wanted.length) {
    const { data } = await admin.from("profiles").select("id, full_name, email").in("id", wanted);
    for (const p of data ?? []) names.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
  }

  const roleRows = (roles.data ?? []) as unknown as { roles: { key: string } | null }[];
  return {
    profile,
    roles: roleRows.map((r) => r.roles?.key).filter((k): k is string => Boolean(k)),
    summary: parseCustomerSummary(summary.data),
    bookings: bookings.data ?? [],
    ledger: ledger.data ?? [],
    referrals: referralRows,
    reviews: reviews.data ?? [],
    notes: notes.data ?? [],
    names,
  };
}
