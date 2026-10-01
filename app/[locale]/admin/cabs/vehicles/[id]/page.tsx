import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FleetDocuments } from "@/components/admin/cab-documents";
import { FleetAlerts } from "@/components/admin/cab-expiry";
import { VehicleForm } from "@/components/admin/cab-fleet-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getVehicle, listCategories, listDrivers, listFleetDocuments, listModels } from "@/lib/cabs/admin";
import { deleteVehicle } from "@/lib/cabs/admin-actions";
import { newVehicleValues, vehicleFormValues } from "@/lib/cabs/admin-rows";
import { fleetExpiryAlerts } from "@/lib/cabs/expiry";
import { todayInIndia } from "@/lib/dates";

const LIST = "/admin/cabs/vehicles";

export default async function EditCabVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, categories, models, drivers, vehicle, documents] = await Promise.all([
    getTranslations("cabsAdmin"),
    listCategories(),
    listModels(),
    listDrivers(),
    id ? getVehicle(id) : null,
    id ? listFleetDocuments("vehicle", id) : [],
  ]);
  if (id && !vehicle) notFound();
  const firstCategory = categories[0]?.id;
  if (!vehicle && !firstCategory) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={vehicle ? vehicle.registration_no : t("vehicles.newTitle")}
        backHref={LIST}
        backLabel={t("vehicles.title")}
      />
      {vehicle ? <FleetAlerts alerts={fleetExpiryAlerts([], [vehicle], todayInIndia())} /> : null}
      <VehicleForm
        defaultValues={vehicle ? vehicleFormValues(vehicle) : newVehicleValues(firstCategory ?? "")}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        models={models.map((m) => ({ value: m.id, label: m.name, categoryId: m.category_id }))}
        drivers={drivers
          .filter((d) => d.is_active || d.id === vehicle?.default_driver_id)
          .map((d) => ({ value: d.id, label: d.full_name }))}
        editHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deleteVehicle}
              redirectTo={LIST}
              confirmText={t("vehicles.confirmDelete")}
            />
          ) : undefined
        }
      />
      {id ? <FleetDocuments ownerType="vehicle" ownerId={id} documents={documents} canWrite /> : null}
    </div>
  );
}
