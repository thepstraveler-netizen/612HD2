import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { clientIpFrom } from "./rate-limit";
import { getSecuritySettings } from "./settings";

/**
 * Cloudflare Turnstile (free bot check) on public forms (D-094). The browser
 * widget puts a one-time token in the form; the server checks it here. It is
 * skipped entirely unless both NEXT_PUBLIC_TURNSTILE_SITE_KEY and
 * TURNSTILE_SECRET_KEY are set and `security.defaults.turnstile_enabled` is
 * on, so the site works without a Cloudflare account. Swapping providers
 * (hCaptcha, reCAPTCHA) means adding another CaptchaVerifier.
 */

export type CaptchaResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unavailable" };

export interface CaptchaVerifier {
  readonly name: string;
  verify(token: string, remoteIp?: string): Promise<CaptchaResult>;
}

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifySchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional().default([]),
});

export function turnstileVerifier(secret: string, deps: { fetch?: typeof fetch } = {}): CaptchaVerifier {
  const doFetch = deps.fetch ?? fetch;
  return {
    name: "turnstile",
    async verify(token, remoteIp) {
      if (!token) return { ok: false, reason: "missing" };
      const body = new URLSearchParams({ secret, response: token });
      if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
      let json: unknown;
      try {
        const res = await doFetch(TURNSTILE_VERIFY_URL, { method: "POST", body, cache: "no-store" });
        if (!res.ok) throw new Error(`siteverify responded ${res.status}`);
        json = await res.json();
      } catch (error) {
        console.error("[security] Turnstile siteverify failed", error);
        return { ok: false, reason: "unavailable" };
      }
      const parsed = siteverifySchema.safeParse(json);
      if (!parsed.success) return { ok: false, reason: "unavailable" };
      if (parsed.data.success) return { ok: true };
      // A wrong secret is our fault, not the visitor's: log it loudly.
      if (parsed.data["error-codes"].some((c) => c.includes("secret"))) {
        console.error("[security] Turnstile secret rejected", parsed.data["error-codes"]);
      }
      return { ok: false, reason: "invalid" };
    },
  };
}

/** The verifier for this deployment, or null when Turnstile keys are not set. */
export function defaultCaptchaVerifier(): CaptchaVerifier | null {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null;
  return turnstileVerifier(secret);
}

/**
 * Checks a form's token. Returns ok when Turnstile is not configured or is
 * switched off in settings. Callers return their "captcha" error otherwise.
 */
export async function verifyCaptcha(token: string | undefined | null): Promise<CaptchaResult> {
  const verifier = defaultCaptchaVerifier();
  if (!verifier) return { ok: true };
  const settings = await getSecuritySettings();
  if (!settings.turnstile_enabled) return { ok: true };
  if (!token) return { ok: false, reason: "missing" };
  const result = await verifier.verify(token, clientIpFrom(await headers()));
  // Cloudflare unreachable: let the visitor through (rate limits still apply).
  return result.ok || result.reason !== "unavailable" ? result : { ok: true };
}
