"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { STAFF_ROLES, type RoleKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRefCode, REF_COOKIE, toClaimError, type ClaimError } from "./link";

export type ClaimResult =
  { status: "claimed" } | { status: "none" } | { status: "error"; error: ClaimError | "unknown" };

/**
 * Claims the referral code a visitor arrived with (`ps_ref` cookie, set by
 * middleware from `?ref=`), once, after sign-in. The cookie is always
 * removed so the claim is attempted only once. Staff never claim.
 */
export async function claimPendingReferral(): Promise<ClaimResult> {
  const store = await cookies();
  const code = parseRefCode(store.get(REF_COOKIE)?.value);
  if (!store.has(REF_COOKIE)) return { status: "none" };
  const session = await getSession();
  if (!session) return { status: "none" };
  store.delete(REF_COOKIE);
  if (!code) return { status: "error", error: "invalid_code" };
  if (session.roles.some((r) => STAFF_ROLES.includes(r as RoleKey))) return { status: "none" };
  if (!hasServiceRole()) return { status: "none" };

  const { error } = await createAdminClient().rpc("claim_referral", {
    p_user: session.user.id,
    p_code: code,
  });
  if (!error) return { status: "claimed" };
  const mapped = toClaimError(error.message);
  if (mapped === "unknown") console.error("[referrals] claim", error);
  return { status: "error", error: mapped };
}
