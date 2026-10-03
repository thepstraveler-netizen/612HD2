import "server-only";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { firstName } from "./link";

export type ReferredFriend = {
  id: string;
  name: string | null;
  status: Database["public"]["Enums"]["referral_status"];
  createdAt: string;
  rewardedAt: string | null;
};

/** The verified user's referral code, created on first use. */
export async function getReferralCode(userId: string): Promise<string | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await createAdminClient().rpc("ensure_referral_code", { p_user: userId });
  if (error) {
    console.error("[referrals] code", error);
    return null;
  }
  return data;
}

/**
 * Friends who joined with the user's code. Only first names are shown, read
 * with the service role because customers cannot read other profiles.
 */
export async function listReferredFriends(userId: string): Promise<ReferredFriend[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("referrals")
    .select("id, referee_id, status, created_at, rewarded_at")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const names = new Map<string, string | null>();
  if (rows.length && hasServiceRole()) {
    const { data: profiles } = await createAdminClient()
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        rows.map((r) => r.referee_id),
      );
    for (const p of profiles ?? []) names.set(p.id, firstName(p.full_name));
  }
  return rows.map((r) => ({
    id: r.id,
    name: names.get(r.referee_id) ?? null,
    status: r.status,
    createdAt: r.created_at,
    rewardedAt: r.rewarded_at,
  }));
}
