import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceRole } from "@/lib/env.server";
import {
  invoiceSettingsSchema,
  paymentSettingsSchema,
  type InvoiceSettings,
  type PaymentSettings,
} from "@/schemas/booking";

/**
 * Checkout settings live in the `settings` table (admin → Settings). Payment
 * and invoice settings are not public, so they are read with the service
 * role; the cache is cleared by every admin save (catalog tag).
 */

async function readPrivateSetting(key: string): Promise<unknown> {
  if (!hasServiceRole()) return undefined;
  const { data } = await createAdminClient().from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value;
}

export const getPaymentSettings = unstable_cache(
  async (): Promise<PaymentSettings> => {
    const parsed = paymentSettingsSchema.safeParse((await readPrivateSetting("payments.defaults")) ?? {});
    return parsed.success ? parsed.data : paymentSettingsSchema.parse({});
  },
  ["bookings:payment-settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

export const getInvoiceSettings = unstable_cache(
  async (): Promise<InvoiceSettings> => {
    const parsed = invoiceSettingsSchema.safeParse((await readPrivateSetting("business.invoice")) ?? {});
    return parsed.success ? parsed.data : invoiceSettingsSchema.parse({});
  },
  ["bookings:invoice-settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

export const getFeatureFlag = unstable_cache(
  async (key: string): Promise<boolean> => {
    const supabase = createPublicClient();
    if (!supabase) return false;
    const { data } = await supabase.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
    return data?.enabled ?? false;
  },
  ["catalog:feature-flag"],
  { tags: [CATALOG_TAG], revalidate: 300 },
);
