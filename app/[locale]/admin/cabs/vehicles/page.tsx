import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FleetAlerts, expiryCell } from "@/components/admin/cab-expiry";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listCategories, listDrivers, listModels, listVehicles } from "@/lib/cabs/admin";
import { fleetExpiryAlerts, vehicleExpiryAlerts } from "@/lib/cabs/expiry";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabVehiclesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/vehicles");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, format, locale, vehicles, categories, models, drivers] = await Promise.all([
    getTranslations("cabsAdmin"),
    getFormatter(),
    getLocale(),
    listVehicles(),
    listCategories(),
    listModels(),
    listDrivers(),
  ]);
  const today = todayInIndia();
  const categoryName = new Map(categories.map((c) => [c.id, pickLocalized(c.name, locale)]));
  const modelName = new Map(models.map((m) => [m.id, m.name]));
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
  const alerts = fleetExpiryAlerts(
    [],
    vehicles.filter((v) => v.is_active),
    today,
  );
  const canAdd = canWrite && categories.length > 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("vehicles.title")}
        lead={t("vehicles.lead")}
        newHref={canAdd ? "/admin/cabs/vehicles/new" : undefined}
        newLabel={t("vehicles.new")}
      >
        <CabSubnav active="vehicles" />
      </AdminPageHeader>
      <FleetAlerts alerts={alerts} />
      <DataTable
        rows={vehicles.map((v) => ({
          id: v.id,
          registration: v.registration_no,
          category: categoryName.get(v.category_id) ?? "–",
          model: v.model_id ? (modelName.get(v.model_id) ?? "–") : "–",
          fuel: t(`fuels.${v.fuel}`),
          driver: v.default_driver_id ? (driverName.get(v.default_driver_id) ?? "–") : "–",
          papers: expiryCell(t, format, vehicleExpiryAlerts(v, today)),
          active: v.is_active,
        }))}
        editHref={canWrite ? "/admin/cabs/vehicles" : undefined}
        columns={[
          { key: "registration", header: t("vehicles.registration") },
          { key: "category", header: t("vehicles.category") },
          { key: "model", header: t("vehicles.model") },
          { key: "fuel", header: t("categories.fuel") },
          { key: "driver", header: t("vehicles.defaultDriver") },
          { key: "papers", header: t("expiry.column"), kind: "tone" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
