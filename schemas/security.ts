import { z } from "zod";
import type { SecuritySettings } from "@/lib/security/settings";

/**
 * Settings → Security form (`security.defaults`, Phase 11; the stored value
 * is parsed by lib/security/settings.ts) and the two-step sign-in code.
 * Field messages are keys under `cms.errors` or `mfa.errors`.
 */

export const RATE_LIMIT_KEYS = [
  "auth",
  "enquiry",
  "coupon",
  "partner",
  "review",
  "upload",
  "export",
] as const;
export type RateLimitKey = (typeof RATE_LIMIT_KEYS)[number];

export const RATE_LIMIT_MAX = 100_000;
export const RATE_WINDOW_MAX_MINUTES = 1440;

// ---------------------------------------------------------------- admin form

const wholeNumber = (min: number, max: number) =>
  z.coerce
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .min(min, { error: "invalid" })
    .max(max, { error: "invalid" });

const rateLimitFormSchema = z.object({
  limit: wholeNumber(1, RATE_LIMIT_MAX),
  window_minutes: wholeNumber(1, RATE_WINDOW_MAX_MINUTES),
});

/** Settings → Security. Windows are edited in whole minutes. */
export const securitySettingsFormSchema = z.object({
  require_admin_mfa: z.boolean(),
  turnstile_enabled: z.boolean(),
  rate_limits: z.object(
    Object.fromEntries(RATE_LIMIT_KEYS.map((k) => [k, rateLimitFormSchema])) as Record<
      RateLimitKey,
      typeof rateLimitFormSchema
    >,
  ),
});
export type SecuritySettingsFormInput = z.input<typeof securitySettingsFormSchema>;
export type SecuritySettingsForm = z.output<typeof securitySettingsFormSchema>;

export function securitySettingsFormValues(s: SecuritySettings): SecuritySettingsFormInput {
  return {
    require_admin_mfa: s.require_admin_mfa,
    turnstile_enabled: s.turnstile_enabled,
    rate_limits: Object.fromEntries(
      RATE_LIMIT_KEYS.map((k) => [
        k,
        {
          limit: s.rate_limits[k].limit,
          window_minutes: Math.max(1, Math.round(s.rate_limits[k].window_seconds / 60)),
        },
      ]),
    ) as SecuritySettingsFormInput["rate_limits"],
  };
}

export function securitySettingsValue(form: SecuritySettingsForm): SecuritySettings {
  return {
    require_admin_mfa: form.require_admin_mfa,
    turnstile_enabled: form.turnstile_enabled,
    rate_limits: Object.fromEntries(
      RATE_LIMIT_KEYS.map((k) => [
        k,
        { limit: form.rate_limits[k].limit, window_seconds: form.rate_limits[k].window_minutes * 60 },
      ]),
    ) as SecuritySettings["rate_limits"],
  };
}

// ---------------------------------------------------------------- two-step sign-in

/** A 6-digit authenticator code; spaces people type from the app are ignored. */
export const mfaCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, { error: "codeInvalid" }));

export const mfaVerifySchema = z.object({
  factorId: z.string().trim().min(1).max(64),
  code: mfaCodeSchema,
});
export type MfaVerifyInput = z.input<typeof mfaVerifySchema>;

export const mfaFactorSchema = z.object({ factorId: z.string().trim().min(1).max(64) });

export const mfaEnrollSchema = z.object({
  friendlyName: z.string().trim().max(60).optional(),
});
