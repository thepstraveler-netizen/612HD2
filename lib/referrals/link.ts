/**
 * Referral links and the first-party cookie that carries `?ref=CODE` until
 * the visitor signs in (D-086). Pure, so middleware (edge) can import it.
 */

export const REF_COOKIE = "ps_ref";
export const REF_PARAM = "ref";
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Matches `profiles.referral_code`. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

/** A referral code from a URL or cookie, normalised, or null when it can't be one. */
export function parseRefCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** Reads `ps_ref` from a raw `Cookie` header (for code that only has the header). */
export function refCodeFromCookieHeader(header: string | null | undefined): string | null {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REF_COOKIE) {
      try {
        return parseRefCode(decodeURIComponent(rest.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** `https://site/?ref=CODE`, or `https://site/hi?ref=CODE` for Hindi. */
export function buildReferralLink(siteUrl: string, locale: string, code: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const path = locale === "hi" ? "/hi" : "/";
  return `${base}${path}?${REF_PARAM}=${encodeURIComponent(code)}`;
}

/** WhatsApp share link with prefilled text (works on phones and WhatsApp Web). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** "Radha Krishna Sharma" → "Radha"; privacy for the referred-friends list. */
export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export const CLAIM_ERRORS = [
  "referrals_disabled",
  "invalid_code",
  "self_referral",
  "already_referred",
  "not_eligible",
] as const;
export type ClaimError = (typeof CLAIM_ERRORS)[number];

/** Maps a Postgres exception message from `claim_referral` to a known error. */
export function toClaimError(message: string | null | undefined): ClaimError | "unknown" {
  return CLAIM_ERRORS.find((e) => (message ?? "").includes(e)) ?? "unknown";
}
