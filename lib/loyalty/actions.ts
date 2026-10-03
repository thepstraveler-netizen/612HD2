"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemSchema } from "@/schemas/account";
import { getLoyaltySettings, getPointsBalance } from "./queries";
import { toRedeemError, validateRedeem, type RedeemError } from "./rules";

export type RedeemResult =
  | { ok: true; code: string; valuePaise: number; endsAt: string | null; points: number }
  | { ok: false; error: RedeemError | "signin" | "unknown" };

/**
 * Turns points into a one-time personal reward code (D-085). The user id
 * comes from the verified session, never from the form.
 */
export async function redeemPoints(input: unknown): Promise<RedeemResult> {
  const session = await getSession();
  if (!session || session.profile?.is_blocked) return { ok: false, error: "signin" };
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "unknown" };

  const { points } = parsed.data;
  const [settings, balance] = await Promise.all([getLoyaltySettings(), getPointsBalance(session.user.id)]);
  const precheck = validateRedeem(points, balance, settings);
  if (precheck) return { ok: false, error: precheck };

  const { data, error } = await createAdminClient().rpc("redeem_points", {
    p_user: session.user.id,
    p_points: points,
  });
  if (error || !data) {
    const mapped = toRedeemError(error?.message);
    if (mapped === "unknown") console.error("[loyalty] redeem", error);
    return { ok: false, error: mapped };
  }
  revalidatePath("/[locale]/account", "layout");
  return { ok: true, code: data.code, valuePaise: data.value, endsAt: data.ends_at, points };
}
