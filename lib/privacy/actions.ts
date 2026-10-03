"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { mfaSatisfied } from "@/lib/mfa/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletionRequestSchema } from "@/schemas/privacy";
import { privacyRpcError } from "./rows";

/**
 * Account deletion requests from Account → Privacy & security (D-095). The
 * customer never writes privacy_requests directly: the SECURITY DEFINER
 * functions run with the service role and the session's own user id.
 */

export type PrivacyResult =
  { ok: true } | { ok: false; error: "signin" | "invalid" | "alreadyRequested" | "notFound" | "unknown" };

const refresh = () => revalidatePath("/[locale]/account/security", "page");

async function currentUser() {
  const session = await getSession();
  if (!session || session.profile?.is_blocked || !(await mfaSatisfied(session))) return null;
  return session;
}

export async function requestAccountDeletion(input: unknown): Promise<PrivacyResult> {
  const session = await currentUser();
  if (!session) return { ok: false, error: "signin" };
  const parsed = deletionRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { error } = await createAdminClient().rpc("request_account_deletion", {
    p_user: session.user.id,
    p_reason: parsed.data.reason || null,
  });
  if (error) {
    const code = privacyRpcError(error.message);
    if (code === "alreadyRequested" || code === "notFound") return { ok: false, error: code };
    console.error("[privacy] request deletion", error);
    return { ok: false, error: "unknown" };
  }
  refresh();
  return { ok: true };
}

export async function cancelAccountDeletion(): Promise<PrivacyResult> {
  const session = await currentUser();
  if (!session) return { ok: false, error: "signin" };
  const { data, error } = await createAdminClient().rpc("cancel_account_deletion", {
    p_user: session.user.id,
  });
  if (error) {
    console.error("[privacy] cancel deletion", error);
    return { ok: false, error: "unknown" };
  }
  if (!data) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}
