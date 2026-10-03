import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import {
  ledgerLabelKey,
  parseLoyaltySettings,
  rewardCodeFromNote,
  type LedgerEntry,
  type LoyaltySettings,
} from "./rules";

/** `loyalty.defaults` is public; admin saves clear the catalog tag. */
export const getLoyaltySettings = unstable_cache(
  async (): Promise<LoyaltySettings> => {
    const supabase = createPublicClient();
    if (!supabase) return parseLoyaltySettings({});
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "loyalty.defaults")
      .maybeSingle();
    return parseLoyaltySettings(data?.value);
  },
  ["loyalty:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

/**
 * The caller's points balance. Callers pass the id of the user they already
 * verified (requireUser / getSession); never a user id from the browser.
 */
export async function getPointsBalance(userId: string): Promise<number> {
  if (hasServiceRole()) {
    const { data, error } = await createAdminClient().rpc("loyalty_balance", { p_user: userId });
    if (!error && typeof data === "number") return data;
  }
  // Fallback: the customer may read their own ledger (RLS).
  const supabase = await createClient();
  const { data } = await supabase.from("loyalty_ledger").select("points").eq("user_id", userId);
  return (data ?? []).reduce((sum, r) => sum + r.points, 0);
}

/** Latest ledger rows with booking codes, through the customer's own session. */
export async function listLedger(userId: string, limit = 50): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loyalty_ledger")
    .select("id, kind, points, booking_id, note, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter((id): id is string => Boolean(id)))];
  const codes = new Map<string, string>();
  if (bookingIds.length) {
    const { data: bookings } = await supabase.from("bookings").select("id, code").in("id", bookingIds);
    for (const b of bookings ?? []) codes.set(b.id, b.code);
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    points: r.points,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    bookingCode: r.booking_id ? (codes.get(r.booking_id) ?? null) : null,
    rewardCode: r.kind === "redeem" || r.kind === "restore" ? rewardCodeFromNote(r.note) : null,
    note: ledgerLabelKey(r.kind, r.points).startsWith("adjust") ? r.note : null,
  }));
}

export type RewardCode = { id: string; code: string; valuePaise: number; endsAt: string | null };

/**
 * The customer's unused, unexpired reward codes. Coupons are not readable by
 * customers, so this uses the service role filtered to the verified user.
 */
export async function listActiveRewardCodes(userId: string): Promise<RewardCode[]> {
  if (!hasServiceRole()) return [];
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("coupons")
    .select("id, code, value, ends_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("ends_at", { ascending: true })
    .limit(20);
  const coupons = data ?? [];
  if (!coupons.length) return [];
  const { data: used } = await admin
    .from("coupon_redemptions")
    .select("coupon_id")
    .in(
      "coupon_id",
      coupons.map((c) => c.id),
    )
    .in("status", ["reserved", "redeemed"]);
  const usedIds = new Set((used ?? []).map((u) => u.coupon_id));
  return coupons
    .filter((c) => !usedIds.has(c.id))
    .map((c) => ({ id: c.id, code: c.code, valuePaise: c.value, endsAt: c.ends_at }));
}
