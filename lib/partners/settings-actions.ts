"use server";

import { mutate, type Supabase } from "@/lib/admin/mutate";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { createClient } from "@/lib/supabase/server";
import { settlementsSettingsSchema } from "@/schemas/settlements";
import { partnersSettingsSchema } from "@/schemas/partners";
import { partnersSettingsFormSchema, settlementsSettingsFormSchema } from "@/schemas/vendor-admin";
import type { Json } from "@/types/database";
import { settlementsSettingsValue } from "@/lib/settlements/admin-rows";
import { agreementNeedsNewVersion, partnersSettingsValue } from "./admin-rows";

/**
 * Settings → Partners & settlements, through {@link mutate} with
 * settings.write: `partners.defaults` (public: the onboarding form reads it)
 * and `settlements.defaults` (staff only). Changed agreement text must come
 * with a new agreement version, because applicants accept a version.
 */

const invalidContent = { message: "invalidContent", code: "invalidContent" };

async function storedValue(supabase: Supabase, key: string) {
  return supabase.from("settings").select("value").eq("key", key).maybeSingle();
}

async function saveSetting(
  supabase: Supabase,
  key: string,
  stored: Json | undefined,
  value: { [key: string]: Json | undefined },
  isPublic: boolean,
) {
  return {
    error: (
      await supabase
        .from("settings")
        .upsert({ key, value: mergeSettingValue(stored, value), is_public: isPublic })
    ).error,
  };
}

export async function savePartnersSettings(input: unknown) {
  // The stored agreement is read first so a text change without a new version is a field error.
  const supabase = await createClient();
  const { data: before } = await storedValue(supabase, "partners.defaults");
  const current = partnersSettingsSchema.safeParse(before?.value ?? {});
  const schema = partnersSettingsFormSchema.superRefine((form, ctx) => {
    const next = { version: form.agreement_version, body: form.agreement_body };
    if (agreementNeedsNewVersion(current.success ? current.data.agreement : null, next)) {
      ctx.addIssue({ code: "custom", path: ["agreement_version"], message: "agreementVersionBump" });
    }
  });
  return mutate("settings.write", schema, input, async (form, db) => {
    const value = partnersSettingsSchema.safeParse(partnersSettingsValue(form));
    if (!value.success) return { error: invalidContent };
    const { data: stored, error } = await storedValue(db, "partners.defaults");
    if (error) return { error };
    return saveSetting(
      db,
      "partners.defaults",
      stored?.value,
      value.data as { [key: string]: Json | undefined },
      true,
    );
  });
}

/** The stored provider is kept (only "manual" exists). */
export async function saveSettlementsSettings(input: unknown) {
  return mutate("settings.write", settlementsSettingsFormSchema, input, async (form, db) => {
    const { data: stored, error } = await storedValue(db, "settlements.defaults");
    if (error) return { error };
    const current = settlementsSettingsSchema.safeParse(stored?.value ?? {});
    const provider = current.success ? current.data.provider : "manual";
    const value = settlementsSettingsSchema.safeParse(settlementsSettingsValue(form, provider));
    if (!value.success) return { error: invalidContent };
    return saveSetting(
      db,
      "settlements.defaults",
      stored?.value,
      value.data as { [key: string]: Json | undefined },
      false,
    );
  });
}
