import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  BusinessProfileForm,
  CabSettingsForm,
  FeatureFlagList,
  InvoiceSettingsForm,
  PaymentSettingsForm,
  RideSettingsForm,
} from "@/components/admin/settings-forms";
import { DeliverySettingsForm } from "@/components/admin/delivery-settings-form";
import { PackagesSettingsForms } from "@/components/admin/packages-settings-form";
import { PartnersSettingsForms } from "@/components/admin/partners-settings-form";
import { EngagementSettingsForms } from "@/components/admin/engagement-settings-form";
import { SecuritySettingsForm } from "@/components/mfa/security-settings-form";
import { getSecuritySettings } from "@/lib/security/settings";
import { securitySettingsFormValues } from "@/schemas/security";
import { requirePermission } from "@/lib/auth/guards";
import { invoiceSettingsFormValues, paymentSettingsFormValues } from "@/lib/bookings/admin-forms";
import { cabSettingsFormValues } from "@/lib/cabs/admin-rows";
import { deliverySettingsFormValues } from "@/lib/delivery/admin-rows";
import {
  leadsSettingsFormValues,
  packagesSettingsFormValues,
  travelSettingsFormValues,
} from "@/lib/packages/admin-rows";
import { partnersSettingsFormValues } from "@/lib/partners/admin-rows";
import { rideSettingsFormValues } from "@/lib/rides/admin-rows";
import { loyaltySettingsFormValues, reviewsSettingsFormValues } from "@/lib/engagement/admin-rows";
import { parseLoyaltySettings } from "@/lib/loyalty/rules";
import { reviewsSettingsSchema } from "@/schemas/reviews";
import { settlementsSettingsFormValues } from "@/lib/settlements/admin-rows";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";
import { invoiceSettingsSchema, paymentSettingsSchema } from "@/schemas/booking";
import { cabSettingsSchema } from "@/schemas/cabs";
import { deliverySettingsSchema } from "@/schemas/delivery";
import { leadsSettingsSchema } from "@/schemas/leads";
import { packagesSettingsSchema, travelSettingsSchema } from "@/schemas/packages";
import { partnersSettingsSchema } from "@/schemas/partners";
import { settlementsSettingsSchema } from "@/schemas/settlements";
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
      .in("key", [
        "payments.defaults",
        "business.invoice",
        "cabs.defaults",
        "rides.defaults",
        "delivery.defaults",
        "packages.defaults",
        "leads.defaults",
        "travel.defaults",
        "partners.defaults",
        "settlements.defaults",
        "reviews.defaults",
        "loyalty.defaults",
      ]),
  ]);
  // Fill gaps so an older or partial row still opens in the form.
  const stored = businessProfileSchema.partial().safeParse(profileRow?.value ?? {});
  const profile: BusinessProfile = { ...EMPTY_PROFILE, ...(stored.success ? stored.data : {}) };
  const canWrite = hasPermission(session.permissions, "settings.write");
  const canManageRoles = hasPermission(session.permissions, "users.manage_roles");
  // Stored checkout settings over the defaults; an invalid stored row opens with the defaults.
  const storedValue = (key: string) => checkoutRows?.find((r) => r.key === key)?.value ?? {};
  const payments = paymentSettingsSchema.safeParse(storedValue("payments.defaults"));
  const invoice = invoiceSettingsSchema.safeParse(storedValue("business.invoice"));
  const cabs = cabSettingsSchema.safeParse(storedValue("cabs.defaults"));
  const rides = rideSettingsSchema.safeParse(storedValue("rides.defaults"));
  const delivery = deliverySettingsSchema.safeParse(storedValue("delivery.defaults"));
  const packages = packagesSettingsSchema.safeParse(storedValue("packages.defaults"));
  const leads = leadsSettingsSchema.safeParse(storedValue("leads.defaults"));
  const travel = travelSettingsSchema.safeParse(storedValue("travel.defaults"));
  const travelValue = travel.success ? travel.data : travelSettingsSchema.parse({});
  const partners = partnersSettingsSchema.safeParse(storedValue("partners.defaults"));
  const settlements = settlementsSettingsSchema.safeParse(storedValue("settlements.defaults"));
  const settlementsValue = settlements.success ? settlements.data : settlementsSettingsSchema.parse({});
  const reviewsSettings = reviewsSettingsSchema.safeParse(storedValue("reviews.defaults"));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("admin.modules.settings")} lead={t("cms.settingsLead")}>
        {canManageRoles ? (
          <Button asChild variant="outline">
            <Link href="/admin/settings/users">
              <Users /> {t("rolesAdmin.title")}
            </Link>
          </Button>
        ) : null}
      </AdminPageHeader>
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
      {canWrite ? (
        <DeliverySettingsForm
          defaultValues={deliverySettingsFormValues(
            delivery.success ? delivery.data : deliverySettingsSchema.parse({}),
          )}
        />
      ) : null}
      {canWrite ? (
        <PackagesSettingsForms
          packages={packagesSettingsFormValues(
            packages.success ? packages.data : packagesSettingsSchema.parse({}),
          )}
          leads={leadsSettingsFormValues(leads.success ? leads.data : leadsSettingsSchema.parse({}))}
          travel={travelSettingsFormValues(travelValue)}
          travelProvider={travelValue.provider}
        />
      ) : null}
      {canWrite ? (
        <PartnersSettingsForms
          partners={partnersSettingsFormValues(
            partners.success ? partners.data : partnersSettingsSchema.parse({}),
          )}
          settlements={settlementsSettingsFormValues(settlementsValue)}
          provider={settlementsValue.provider}
        />
      ) : null}
      {canWrite ? (
        <EngagementSettingsForms
          reviews={reviewsSettingsFormValues(
            reviewsSettings.success ? reviewsSettings.data : reviewsSettingsSchema.parse({}),
          )}
          loyalty={loyaltySettingsFormValues(parseLoyaltySettings(storedValue("loyalty.defaults")))}
        />
      ) : null}
      {canWrite ? (
        <SecuritySettingsForm defaultValues={securitySettingsFormValues(await getSecuritySettings())} />
      ) : null}
      <FeatureFlagList flags={flags ?? []} canWrite={canWrite} />
    </div>
  );
}
