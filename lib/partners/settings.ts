import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createPublicClient } from "@/lib/supabase/public";
import { partnersSettingsSchema, type PartnersSettings } from "@/schemas/partners";

/** `partners.defaults` is public (the onboarding form reads it); cached under the catalog tag. */
export const getPartnersSettings = unstable_cache(
  async (): Promise<PartnersSettings> => {
    const supabase = createPublicClient();
    if (!supabase) return partnersSettingsSchema.parse({});
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "partners.defaults")
      .maybeSingle();
    const parsed = partnersSettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : partnersSettingsSchema.parse({});
  },
  ["partners:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
