/**
 * Two-step sign-in (TOTP through Supabase Auth MFA) decisions, kept pure so
 * they can be unit-tested. The server guard (lib/mfa/server.ts) feeds them
 * the session's assurance level, the user's factors and the
 * `security.defaults.require_admin_mfa` setting.
 *
 * - Anyone with a verified factor whose session is still aal1 (password,
 *   magic link or Google only) must enter a code before using a protected
 *   area, so an enrolled factor actually protects the account.
 * - Only staff (the admin area) can be forced to set one up, when the
 *   setting is on. Customers and vendors enrol if they want to.
 */

export type MfaArea = "admin" | "other";
export type AssuranceLevel = "aal1" | "aal2";
export type MfaDecision = "allow" | "challenge" | "enrol";

export type MfaPolicyInput = {
  area: MfaArea;
  hasVerifiedFactor: boolean;
  currentLevel: AssuranceLevel | null;
  requireAdminMfa: boolean;
};

export function decideMfa({
  area,
  hasVerifiedFactor,
  currentLevel,
  requireAdminMfa,
}: MfaPolicyInput): MfaDecision {
  if (hasVerifiedFactor) return currentLevel === "aal2" ? "allow" : "challenge";
  if (area === "admin" && requireAdminMfa) return "enrol";
  return "allow";
}

export const MFA_CHALLENGE_PATH = "/mfa";
export const SECURITY_PAGE_PATH = "/account/security";

/** Where a guard sends the user for a decision, keeping `next` for after the code. */
export function mfaRedirectHref(decision: MfaDecision, nextPath: string): string | null {
  if (decision === "challenge") return `${MFA_CHALLENGE_PATH}?next=${encodeURIComponent(nextPath)}`;
  if (decision === "enrol") return `${SECURITY_PAGE_PATH}?mfa=required`;
  return null;
}

type FactorLike = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
  created_at?: string;
};

/** Verified authenticator-app factors; phone / WebAuthn factors are not offered here. */
export function verifiedTotpFactors<F extends FactorLike>(factors: readonly F[] | null | undefined): F[] {
  return (factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
}

export function hasVerifiedFactor(factors: readonly FactorLike[] | null | undefined): boolean {
  return (factors ?? []).some((f) => f.status === "verified");
}

/** Reads the `aal` claim of a Supabase access token (already validated by getUser()). */
export function aalFromAccessToken(token: string | null | undefined): AssuranceLevel | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json: unknown = JSON.parse(
      Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    const aal = json && typeof json === "object" ? (json as { aal?: unknown }).aal : null;
    return aal === "aal1" || aal === "aal2" ? aal : null;
  } catch {
    return null;
  }
}

/** Supabase returns the QR code as an SVG, with or without the data: prefix. */
export function qrImageSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}
