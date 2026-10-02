import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceRole } from "@/lib/env.server";
import { leadsSettingsSchema, type LeadsSettings } from "@/schemas/leads";

/** `leads.defaults` is staff-only (not public), so it is read with the service role, uncached. */
export async function getLeadsSettings(): Promise<LeadsSettings> {
  if (!hasServiceRole()) return leadsSettingsSchema.parse({});
  const { data } = await createAdminClient()
    .from("settings")
    .select("value")
    .eq("key", "leads.defaults")
    .maybeSingle();
  const parsed = leadsSettingsSchema.safeParse(data?.value ?? {});
  return parsed.success ? parsed.data : leadsSettingsSchema.parse({});
}
