import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DeliveryZoneForm } from "@/components/admin/delivery-catalog-forms";
import { DeliveryDeleteButton } from "@/components/admin/delivery-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getDeliveryZone } from "@/lib/delivery/admin";
import { deleteDeliveryZone } from "@/lib/delivery/admin-actions";
import { NEW_DELIVERY_ZONE, deliveryZoneFormValues } from "@/lib/delivery/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/food/zones";

export default async function EditDeliveryZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("food.write", `${LIST}/${raw}`);
  const [t, locale, zone] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getLocale(),
    id ? getDeliveryZone(id) : null,
  ]);
  if (id && !zone) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={zone ? pickLocalized(zone.name, locale) : t("zones.newTitle")}
        backHref={LIST}
        backLabel={t("zones.title")}
      />
      <DeliveryZoneForm
        defaultValues={zone ? deliveryZoneFormValues(zone) : NEW_DELIVERY_ZONE}
        listHref={LIST}
        deleteButton={
          id ? (
            <DeliveryDeleteButton
              id={id}
              action={deleteDeliveryZone}
              redirectTo={LIST}
              confirmText={t("zones.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
