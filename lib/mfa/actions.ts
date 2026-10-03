"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { mfaFactorSchema, mfaVerifySchema } from "@/schemas/security";
import { verifiedTotpFactors } from "./policy";

/**
 * Two-step sign-in (TOTP) through Supabase Auth MFA, run as the signed-in
 * user with the cookie-bound server client so a verified code upgrades the
 * session to aal2 in place. Code attempts share the `auth` rate limit.
 */

export type MfaError = "signin" | "invalid" | "codeInvalid" | "rateLimited" | "needsCode" | "unknown";
export type MfaResult = { ok: true } | { ok: false; error: MfaError; retryAfter?: number };
export type EnrollResult =
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: MfaError };

const refresh = () => revalidatePath("/[locale]/account/security", "page");

/** Starts enrolment: drops any half-finished factor, then returns the QR code and secret. */
export async function startTotpEnrollment(): Promise<EnrollResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const supabase = await createClient();
  for (const f of session.user.factors ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const count = verifiedTotpFactors(session.user.factors).length;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${count + 1} · ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) {
    console.error("[mfa] enroll", error?.code ?? error?.message);
    return { ok: false, error: error?.code === "insufficient_aal" ? "needsCode" : "unknown" };
  }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Checks a 6-digit code against a factor: finishes enrolment for a new
 * factor, or passes the sign-in challenge for a verified one.
 */
export async function verifyTotpCode(input: unknown): Promise<MfaResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = mfaVerifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "codeInvalid" };
  if (!(session.user.factors ?? []).some((f) => f.id === parsed.data.factorId)) {
    return { ok: false, error: "invalid" };
  }
  const limited = await enforceRateLimit("auth", { userId: session.user.id });
  if (!limited.ok) return { ok: false, error: "rateLimited", retryAfter: limited.retryAfter };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "rateLimited" };
    if (error.code === "mfa_verification_failed" || error.status === 422 || error.status === 400) {
      return { ok: false, error: "codeInvalid" };
    }
    console.error("[mfa] verify", error.code ?? error.message);
    return { ok: false, error: "unknown" };
  }
  refresh();
  return { ok: true };
}

/** Removes a factor. Supabase needs an aal2 session to remove a verified one. */
export async function removeTotpFactor(input: unknown): Promise<MfaResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = mfaFactorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(session.user.factors ?? []).some((f) => f.id === parsed.data.factorId)) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) {
    if (error.code === "insufficient_aal") return { ok: false, error: "needsCode" };
    console.error("[mfa] unenroll", error.code ?? error.message);
    return { ok: false, error: "unknown" };
  }
  refresh();
  return { ok: true };
}
