"use server";

import { mutate } from "@/lib/admin/mutate";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { securitySettingsSchema } from "@/lib/security/settings";
import { securitySettingsFormSchema, securitySettingsValue } from "@/schemas/security";

/**
 * Settings → Security (`security.defaults`): two-step sign-in for staff,
 * Turnstile, and the rate limits. Through {@link mutate} with settings.write
 * (signed-in client, so RLS and the audit log apply); mutate revalidates the
 * catalog tag, which refreshes the cached copy in lib/security/settings.ts.
 * The row stays private (is_public = false).
 */
export async function saveSecuritySettings(input: unknown) {
  return mutate("settings.write", securitySettingsFormSchema, input, async (form, db) => {
    const value = securitySettingsSchema.safeParse(securitySettingsValue(form));
    if (!value.success) return { error: { message: "invalidContent", code: "invalidContent" } };
    const { data: stored, error } = await db
      .from("settings")
      .select("value")
      .eq("key", "security.defaults")
      .maybeSingle();
    if (error) return { error };
    return {
      error: (
        await db.from("settings").upsert({
          key: "security.defaults",
          value: mergeSettingValue(stored?.value, value.data),
          is_public: false,
        })
      ).error,
    };
  });
}
