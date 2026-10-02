import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideVehicleForm } from "@/components/admin/ride-catalog-forms";
import { RideDeleteButton } from "@/components/admin/ride-shared";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { getRideVehicle, listActiveDrivers, listVehicleTypes } from "@/lib/rides/admin";
import { deleteRideVehicle } from "@/lib/rides/admin-actions";
import { newRideVehicleValues, rideVehicleFormValues } from "@/lib/rides/admin-rows";

const LIST = "/admin/rides/vehicles";

export default async function EditRideVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("rides.write", `${LIST}/${raw}`);
  const [t, locale, types, drivers, vehicle] = await Promise.all([
    getTranslations("admin.rides"),
    getLocale(),
    listVehicleTypes(),
    listActiveDrivers(),
    id ? getRideVehicle(id) : null,
  ]);
  if (id && !vehicle) notFound();
  const firstType = types[0]?.id;
  if (!vehicle && !firstType) notFound();
  const typeName = vehicle
    ? pickLocalized(types.find((v) => v.id === vehicle.ride_vehicle_type_id)?.name, locale)
    : "";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={
          vehicle
            ? vehicle.registration_no || `${typeName} · ${vehicle.colour ?? ""}`
            : t("vehicles.newTitle")
        }
        backHref={LIST}
        backLabel={t("vehicles.title")}
      />
      <RideVehicleForm
        defaultValues={vehicle ? rideVehicleFormValues(vehicle) : newRideVehicleValues(firstType ?? "")}
        types={types.map((v) => ({ value: v.id, label: v.name }))}
        drivers={drivers
          .filter((d) => d.is_active || d.id === vehicle?.default_driver_id)
          .map((d) => ({ value: d.id, label: d.full_name }))}
        listHref={LIST}
        deleteButton={
          id ? (
            <RideDeleteButton
              id={id}
              action={deleteRideVehicle}
              redirectTo={LIST}
              confirmText={t("vehicles.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
