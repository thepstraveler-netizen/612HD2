import { UtensilsCrossed } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DeliveryDeleteButton, StoreAcceptingToggle } from "@/components/admin/delivery-shared";
import { DeliveryStoreForm } from "@/components/admin/delivery-store-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminStore, listDeliveryZones, listVendorOptions } from "@/lib/delivery/admin";
import { deleteStore, setStoreAccepting } from "@/lib/delivery/admin-actions";
import { newStoreValues, storeFormValues } from "@/lib/delivery/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";
import { FOOD_KINDS } from "@/schemas/delivery-admin";

const LIST = "/admin/food/stores";

export default async function EditFoodStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("food.write", `${LIST}/${raw}`);
  const [t, locale, found, zones] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getLocale(),
    id ? getAdminStore(id, FOOD_KINDS) : null,
    listDeliveryZones(),
  ]);
  if (id && !found) notFound();
  const vendors = await listVendorOptions(FOOD_KINDS, found?.store.vendor_id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={found ? pickLocalized(found.store.name, locale) : t("stores.newTitle")}
        backHref={LIST}
        backLabel={t("stores.title")}
      >
        {found ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`${LIST}/${found.store.id}/menu`}>
                <UtensilsCrossed /> {t("stores.editMenu")}
              </Link>
            </Button>
            <StoreAcceptingToggle
              id={found.store.id}
              accepting={found.store.accepting_orders}
              action={setStoreAccepting}
            />
          </div>
        ) : null}
      </AdminPageHeader>
      {vendors.length === 0 ? <p className="text-sm text-accent-amber">{t("stores.noVendors")}</p> : null}
      <DeliveryStoreForm
        key={found?.store.updated_at ?? "new"}
        mode="food"
        defaultValues={found ? storeFormValues(found.store, found.zoneIds) : newStoreValues("restaurant")}
        vendors={vendors}
        zones={zones.map((z) => ({ value: z.id, label: z.name }))}
        imageUrl={found?.imageUrl ?? null}
        listHref={LIST}
        deleteButton={
          id ? (
            <DeliveryDeleteButton
              id={id}
              action={deleteStore}
              redirectTo={LIST}
              confirmText={t("stores.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
