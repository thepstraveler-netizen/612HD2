import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `security.defaults` (admin → Settings). Not public, so it is read with the
 * service role and cached under the catalog tag like the other private
 * settings; every admin save revalidates it. Anything missing or malformed
 * falls back to the defaults below, so a bad edit never locks visitors out.
 */

const limitSchema = z.object({
  limit: z.number().int().min(1).max(100_000),
  window_seconds: z.number().int().min(1).max(86_400),
});
export type RateLimitRule = z.output<typeof limitSchema>;

export const DEFAULT_RATE_LIMITS = {
  auth: { limit: 10, window_seconds: 600 },
  enquiry: { limit: 5, window_seconds: 600 },
  coupon: { limit: 30, window_seconds: 600 },
  partner: { limit: 3, window_seconds: 3600 },
  review: { limit: 10, window_seconds: 3600 },
  upload: { limit: 30, window_seconds: 600 },
  export: { limit: 5, window_seconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/** A rule that fails to parse falls back to its own default, not the whole object. */
const rule = (fallback: RateLimitRule) => limitSchema.default(fallback).catch(fallback);

export const securitySettingsSchema = z.object({
  require_admin_mfa: z.boolean().default(false).catch(false),
  turnstile_enabled: z.boolean().default(true).catch(true),
  rate_limits: z
    .object({
      auth: rule(DEFAULT_RATE_LIMITS.auth),
      enquiry: rule(DEFAULT_RATE_LIMITS.enquiry),
      coupon: rule(DEFAULT_RATE_LIMITS.coupon),
      partner: rule(DEFAULT_RATE_LIMITS.partner),
      review: rule(DEFAULT_RATE_LIMITS.review),
      upload: rule(DEFAULT_RATE_LIMITS.upload),
      export: rule(DEFAULT_RATE_LIMITS.export),
    })
    .default(DEFAULT_RATE_LIMITS)
    .catch(DEFAULT_RATE_LIMITS),
});
export type SecuritySettings = z.output<typeof securitySettingsSchema>;

export function parseSecuritySettings(value: unknown): SecuritySettings {
  const parsed = securitySettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : securitySettingsSchema.parse({});
}

export const getSecuritySettings = unstable_cache(
  async (): Promise<SecuritySettings> => {
    if (!hasServiceRole()) return parseSecuritySettings({});
    const { data } = await createAdminClient()
      .from("settings")
      .select("value")
      .eq("key", "security.defaults")
      .maybeSingle();
    return parseSecuritySettings(data?.value);
  },
  ["security:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
