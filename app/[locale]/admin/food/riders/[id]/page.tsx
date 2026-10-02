import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RiderForm } from "@/components/admin/delivery-catalog-forms";
import { DeliveryDeleteButton } from "@/components/admin/delivery-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getRider, listVendorOptions } from "@/lib/delivery/admin";
import { deleteRider } from "@/lib/delivery/admin-actions";
import { NEW_RIDER, riderFormValues } from "@/lib/delivery/admin-rows";
import { STORE_KINDS } from "@/schemas/delivery";

const LIST = "/admin/food/riders";

export default async function EditRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("food.write", `${LIST}/${raw}`);
  const [t, rider] = await Promise.all([getTranslations("deliveryAdmin"), id ? getRider(id) : null]);
  if (id && !rider) notFound();
  const vendors = await listVendorOptions(STORE_KINDS, rider?.vendor_id ?? undefined);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={rider ? rider.full_name : t("riders.newTitle")}
        backHref={LIST}
        backLabel={t("riders.title")}
      />
      <RiderForm
        defaultValues={rider ? riderFormValues(rider) : NEW_RIDER}
        vendors={vendors}
        listHref={LIST}
        deleteButton={
          id ? (
            <DeliveryDeleteButton
              id={id}
              action={deleteRider}
              redirectTo={LIST}
              confirmText={t("riders.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
