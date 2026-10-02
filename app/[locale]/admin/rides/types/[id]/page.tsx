import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { VehicleTypeForm } from "@/components/admin/ride-catalog-forms";
import { RideDeleteButton } from "@/components/admin/ride-shared";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { getVehicleType, listServiceOptions } from "@/lib/rides/admin";
import { deleteVehicleType } from "@/lib/rides/admin-actions";
import { newVehicleTypeValues, vehicleTypeFormValues } from "@/lib/rides/admin-rows";

const LIST = "/admin/rides/types";

export default async function EditRideVehicleTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("rides.write", `${LIST}/${raw}`);
  const locale = await getLocale();
  const [t, services, type] = await Promise.all([
    getTranslations("admin.rides"),
    listServiceOptions(locale),
    id ? getVehicleType(id) : null,
  ]);
  if (id && !type) notFound();
  // Ride services first (bike, rickshaw, car); any service can be linked.
  const defaultService = services.find((s) => s.value === "bike")?.value ?? services[0]?.value ?? "";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={type ? pickLocalized(type.name, locale) : t("types.newTitle")}
        backHref={LIST}
        backLabel={t("types.title")}
      />
      <VehicleTypeForm
        defaultValues={type ? vehicleTypeFormValues(type) : newVehicleTypeValues(defaultService)}
        services={services}
        listHref={LIST}
        deleteButton={
          id ? (
            <RideDeleteButton
              id={id}
              action={deleteVehicleType}
              redirectTo={LIST}
              confirmText={t("types.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
