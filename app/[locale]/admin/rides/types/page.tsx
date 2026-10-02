import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { listVehicleTypes } from "@/lib/rides/admin";

export default async function RideVehicleTypesPage() {
  const session = await requirePermission("rides.read", "/admin/rides/types");
  const canWrite = hasPermission(session.permissions, "rides.write");
  const [t, types] = await Promise.all([getTranslations("admin.rides"), listVehicleTypes()]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("types.title")}
        lead={t("types.lead")}
        newHref={canWrite ? "/admin/rides/types/new" : undefined}
        newLabel={t("types.new")}
      >
        <RideSubnav active="types" />
      </AdminPageHeader>
      <DataTable
        rows={types.map((v) => ({
          id: v.id,
          name: v.name,
          key: v.key,
          service: v.service_slug,
          seats: v.seats,
          booking: v.instant_book ? t("types.instant") : t("types.onRequest"),
          gst: `${bpsToPercentInput(v.tax_bps)}%`,
          active: v.is_active,
          sort: v.sort_order,
        }))}
        editHref={canWrite ? "/admin/rides/types" : undefined}
        columns={[
          { key: "name", header: t("fields.name"), kind: "localized" },
          { key: "key", header: t("fields.key") },
          { key: "service", header: t("types.service") },
          { key: "seats", header: t("types.seats"), kind: "number" },
          { key: "booking", header: t("types.booking"), kind: "badge" },
          { key: "gst", header: t("types.gst"), sortable: false },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
