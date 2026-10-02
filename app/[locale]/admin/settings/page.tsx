import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  BusinessProfileForm,
  CabSettingsForm,
  FeatureFlagList,
  InvoiceSettingsForm,
  PaymentSettingsForm,
  RideSettingsForm,
} from "@/components/admin/settings-forms";
import { requirePermission } from "@/lib/auth/guards";
import { invoiceSettingsFormValues, paymentSettingsFormValues } from "@/lib/bookings/admin-forms";
import { cabSettingsFormValues } from "@/lib/cabs/admin-rows";
import { rideSettingsFormValues } from "@/lib/rides/admin-rows";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";
import { invoiceSettingsSchema, paymentSettingsSchema } from "@/schemas/booking";
import { cabSettingsSchema } from "@/schemas/cabs";
import { rideSettingsSchema } from "@/schemas/rides";
import { businessProfileSchema, type BusinessProfile } from "@/schemas/cms";

const EMPTY_PROFILE: BusinessProfile = {
  name: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  gstin: "",
};

export default async function AdminSettingsPage() {
  const session = await requirePermission("settings.read", "/admin/settings");
  const t = await getTranslations();
  const supabase = await createClient();
  const [{ data: profileRow }, { data: flags }, { data: checkoutRows }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "business.profile").maybeSingle(),
    supabase.from("feature_flags").select("key, enabled, description").order("key"),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["payments.defaults", "business.invoice", "cabs.defaults", "rides.defaults"]),
  ]);
  // Fill gaps so an older or partial row still opens in the form.
  const stored = businessProfileSchema.partial().safeParse(profileRow?.value ?? {});
  const profile: BusinessProfile = { ...EMPTY_PROFILE, ...(stored.success ? stored.data : {}) };
  const canWrite = hasPermission(session.permissions, "settings.write");
  // Stored checkout settings over the defaults; an invalid stored row opens with the defaults.
  const storedValue = (key: string) => checkoutRows?.find((r) => r.key === key)?.value ?? {};
  const payments = paymentSettingsSchema.safeParse(storedValue("payments.defaults"));
  const invoice = invoiceSettingsSchema.safeParse(storedValue("business.invoice"));
  const cabs = cabSettingsSchema.safeParse(storedValue("cabs.defaults"));
  const rides = rideSettingsSchema.safeParse(storedValue("rides.defaults"));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("admin.modules.settings")} lead={t("cms.settingsLead")} />
      {canWrite ? <BusinessProfileForm defaultValues={profile} /> : null}
      {canWrite ? (
        <PaymentSettingsForm
          defaultValues={paymentSettingsFormValues(
            payments.success ? payments.data : paymentSettingsSchema.parse({}),
          )}
        />
      ) : null}
      {canWrite ? (
        <InvoiceSettingsForm
          defaultValues={invoiceSettingsFormValues(
            invoice.success ? invoice.data : invoiceSettingsSchema.parse({}),
          )}
        />
      ) : null}
      {canWrite ? (
        <CabSettingsForm
          defaultValues={cabSettingsFormValues(cabs.success ? cabs.data : cabSettingsSchema.parse({}))}
        />
      ) : null}
      {canWrite ? (
        <RideSettingsForm
          defaultValues={rideSettingsFormValues(rides.success ? rides.data : rideSettingsSchema.parse({}))}
        />
      ) : null}
      <FeatureFlagList flags={flags ?? []} canWrite={canWrite} />
    </div>
  );
}
