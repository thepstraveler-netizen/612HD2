import { getLocale, getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listPlaces, listRoutes } from "@/lib/cabs/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabRoutesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/routes");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, locale, routes, places] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listRoutes(),
    listPlaces(),
  ]);
  const placeName = new Map(places.map((p) => [p.id, pickLocalized(p.name, locale)]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("routes.title")}
        lead={t("routes.lead")}
        newHref={canWrite && places.length > 0 ? "/admin/cabs/routes/new" : undefined}
        newLabel={t("routes.new")}
      >
        <CabSubnav active="routes" />
      </AdminPageHeader>
      <DataTable
        rows={routes.map((r) => ({
          id: r.id,
          route: `${placeName.get(r.from_place_id) ?? "?"} → ${placeName.get(r.to_place_id) ?? "?"}`,
          name: r.name?.en ? pickLocalized(r.name, locale) : "",
          type: t(`tripTypes.${r.trip_type}`),
          distance: Number(r.distance_km),
          duration: t("routes.durationValue", {
            hours: Math.floor(r.duration_minutes / 60),
            minutes: r.duration_minutes % 60,
          }),
          fares: r.fareCount,
          popular: r.is_popular,
          active: r.is_active,
        }))}
        editHref={canWrite ? "/admin/cabs/routes" : undefined}
        columns={[
          { key: "route", header: t("routes.route") },
          { key: "name", header: t("columns.name") },
          { key: "type", header: t("fields.tripType"), kind: "badge" },
          { key: "distance", header: t("routes.distance"), kind: "number" },
          { key: "duration", header: t("routes.durationShort"), sortable: false },
          { key: "fares", header: t("routes.fareCount"), kind: "number" },
          { key: "popular", header: t("fields.popular"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
