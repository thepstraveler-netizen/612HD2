import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { expiryCell } from "@/components/admin/cab-expiry";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { requirePermission } from "@/lib/auth/guards";
import { vehicleExpiryAlerts } from "@/lib/cabs/expiry";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";
import { listActiveDrivers, listRideVehicles, listVehicleTypes } from "@/lib/rides/admin";

/** Bikes, rickshaws and cars used for local rides (cab vehicles are under Cabs). */
export default async function RideVehiclesPage() {
  const session = await requirePermission("rides.read", "/admin/rides/vehicles");
  const canWrite = hasPermission(session.permissions, "rides.write");
  const [t, tc, format, locale, vehicles, types, drivers] = await Promise.all([
    getTranslations("admin.rides"),
    getTranslations("cabsAdmin"),
    getFormatter(),
    getLocale(),
    listRideVehicles(),
    listVehicleTypes(),
    listActiveDrivers(),
  ]);
  const today = todayInIndia();
  const typeName = new Map(types.map((v) => [v.id, pickLocalized(v.name, locale)]));
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
  const canAdd = canWrite && types.length > 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("vehicles.title")}
        lead={t("vehicles.lead")}
        newHref={canAdd ? "/admin/rides/vehicles/new" : undefined}
        newLabel={t("vehicles.new")}
      >
        <RideSubnav active="vehicles" />
      </AdminPageHeader>
      <DataTable
        rows={vehicles.map((v) => ({
          id: v.id,
          registration: v.registration_no ?? t("vehicles.unregistered"),
          type: typeName.get(v.ride_vehicle_type_id) ?? "–",
          colour: v.colour ?? "–",
          fuel: tc(`fuels.${v.fuel}`),
          driver: v.default_driver_id ? (driverName.get(v.default_driver_id) ?? "–") : "–",
          papers: expiryCell(tc, format, vehicleExpiryAlerts(v, today)),
          active: v.is_active,
        }))}
        editHref={canWrite ? "/admin/rides/vehicles" : undefined}
        columns={[
          { key: "registration", header: t("vehicles.registration") },
          { key: "type", header: t("vehicles.type") },
          { key: "colour", header: t("vehicles.colour") },
          { key: "fuel", header: t("vehicles.fuel") },
          { key: "driver", header: t("vehicles.defaultDriver") },
          { key: "papers", header: tc("expiry.column"), kind: "tone" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
