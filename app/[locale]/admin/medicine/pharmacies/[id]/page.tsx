import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DeliveryDeleteButton, StoreAcceptingToggle } from "@/components/admin/delivery-shared";
import { DeliveryStoreForm } from "@/components/admin/delivery-store-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminStore, listDeliveryZones, listVendorOptions } from "@/lib/delivery/admin";
import { deletePharmacy, setPharmacyAccepting } from "@/lib/delivery/admin-actions";
import { newStoreValues, storeFormValues } from "@/lib/delivery/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";
import { PHARMACY_KINDS } from "@/schemas/delivery-admin";

const LIST = "/admin/medicine/pharmacies";

/** A partner pharmacy: the store form without a menu (medicines are quoted per prescription). */
export default async function EditPharmacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("medicine.write", `${LIST}/${raw}`);
  const [t, locale, found, zones] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getLocale(),
    id ? getAdminStore(id, PHARMACY_KINDS) : null,
    listDeliveryZones(),
  ]);
  if (id && !found) notFound();
  const vendors = await listVendorOptions(PHARMACY_KINDS, found?.store.vendor_id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={found ? pickLocalized(found.store.name, locale) : t("pharmacies.newTitle")}
        lead={t("pharmacies.formLead")}
        backHref={LIST}
        backLabel={t("pharmacies.title")}
      >
        {found ? (
          <StoreAcceptingToggle
            id={found.store.id}
            accepting={found.store.accepting_orders}
            action={setPharmacyAccepting}
          />
        ) : null}
      </AdminPageHeader>
      {vendors.length === 0 ? <p className="text-sm text-accent-amber">{t("pharmacies.noVendors")}</p> : null}
      <DeliveryStoreForm
        key={found?.store.updated_at ?? "new"}
        mode="pharmacy"
        defaultValues={found ? storeFormValues(found.store, found.zoneIds) : newStoreValues("pharmacy")}
        vendors={vendors}
        zones={zones.map((z) => ({ value: z.id, label: z.name }))}
        imageUrl={found?.imageUrl ?? null}
        listHref={LIST}
        deleteButton={
          id ? (
            <DeliveryDeleteButton
              id={id}
              action={deletePharmacy}
              redirectTo={LIST}
              confirmText={t("stores.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
