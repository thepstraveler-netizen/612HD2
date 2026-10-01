import { getFormatter, getTranslations } from "next-intl/server";
import { FleetAlerts, expiryCell } from "@/components/admin/cab-expiry";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listDrivers } from "@/lib/cabs/admin";
import { driverExpiryAlerts, fleetExpiryAlerts } from "@/lib/cabs/expiry";
import { todayInIndia } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabDriversPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/drivers");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, format, drivers] = await Promise.all([
    getTranslations("cabsAdmin"),
    getFormatter(),
    listDrivers(),
  ]);
  const today = todayInIndia();
  const alerts = fleetExpiryAlerts(
    drivers.filter((d) => d.is_active),
    [],
    today,
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("drivers.title")}
        lead={t("drivers.lead")}
        newHref={canWrite ? "/admin/cabs/drivers/new" : undefined}
        newLabel={t("drivers.new")}
      >
        <CabSubnav active="drivers" />
      </AdminPageHeader>
      <FleetAlerts alerts={alerts} />
      <DataTable
        rows={drivers.map((d) => ({
          id: d.id,
          name: d.full_name,
          phone: d.phone,
          languages: d.languages.join(", "),
          rating: d.rating === null ? "–" : Number(d.rating).toFixed(1),
          papers: expiryCell(t, format, driverExpiryAlerts(d, today)),
          login: Boolean(d.user_id),
          active: d.is_active,
        }))}
        editHref={canWrite ? "/admin/cabs/drivers" : undefined}
        columns={[
          { key: "name", header: t("columns.name") },
          { key: "phone", header: t("drivers.phone") },
          { key: "languages", header: t("drivers.languages"), sortable: false },
          { key: "rating", header: t("drivers.rating") },
          { key: "papers", header: t("expiry.column"), kind: "tone" },
          { key: "login", header: t("drivers.hasLogin"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
