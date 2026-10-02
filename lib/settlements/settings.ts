import "server-only";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlementsSettingsSchema, type SettlementsSettings } from "@/schemas/settlements";

/** `settlements.defaults` is staff-only (not public), so it is read with the service role, uncached. */
export async function getSettlementsSettings(): Promise<SettlementsSettings> {
  if (!hasServiceRole()) return settlementsSettingsSchema.parse({});
  const { data } = await createAdminClient()
    .from("settings")
    .select("value")
    .eq("key", "settlements.defaults")
    .maybeSingle();
  const parsed = settlementsSettingsSchema.safeParse(data?.value ?? {});
  return parsed.success ? parsed.data : settlementsSettingsSchema.parse({});
}
