import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { listPoints, listZones } from "@/lib/rides/admin";

export default async function RideZonesPage() {
  const session = await requirePermission("rides.read", "/admin/rides/zones");
  const canWrite = hasPermission(session.permissions, "rides.write");
  const [t, zones, points] = await Promise.all([getTranslations("admin.rides"), listZones(), listPoints()]);
  const pointCount = new Map<string, number>();
  for (const p of points) pointCount.set(p.zone_id, (pointCount.get(p.zone_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("zones.title")}
        lead={t("zones.lead")}
        newHref={canWrite ? "/admin/rides/zones/new" : undefined}
        newLabel={t("zones.new")}
      >
        <RideSubnav active="zones" />
      </AdminPageHeader>
      <DataTable
        rows={zones.map((z) => ({
          id: z.id,
          name: z.name,
          slug: z.slug,
          centre: `${z.lat.toFixed(4)}, ${z.lng.toFixed(4)}`,
          radius: `${Number(z.radius_km)} km`,
          points: pointCount.get(z.id) ?? 0,
          active: z.is_active,
          sort: z.sort_order,
        }))}
        editHref={canWrite ? "/admin/rides/zones" : undefined}
        columns={[
          { key: "name", header: t("fields.name"), kind: "localized" },
          { key: "slug", header: t("fields.slug") },
          { key: "centre", header: t("zones.centre"), sortable: false },
          { key: "radius", header: t("zones.radius"), sortable: false },
          { key: "points", header: t("zones.points"), kind: "number" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
