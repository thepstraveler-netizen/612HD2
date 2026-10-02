import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";
import { listPoints, listZones } from "@/lib/rides/admin";

/** Landmarks offered as pickup and drop, filterable by zone (`?zone=<id>`). */
export default async function RidePointsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("rides.read", "/admin/rides/points");
  const canWrite = hasPermission(session.permissions, "rides.write");
  const rawZone = (await searchParams).zone;
  const parsed = z.uuid().safeParse(Array.isArray(rawZone) ? rawZone[0] : rawZone);
  const zoneId = parsed.success ? parsed.data : undefined;
  const [t, locale, zones, points] = await Promise.all([
    getTranslations("admin.rides"),
    getLocale(),
    listZones(),
    listPoints(zoneId),
  ]);
  const zoneName = new Map(zones.map((zn) => [zn.id, pickLocalized(zn.name, locale)]));
  const canAdd = canWrite && zones.length > 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("points.title")}
        lead={t("points.lead")}
        newHref={canAdd ? `/admin/rides/points/new${zoneId ? `?zone=${zoneId}` : ""}` : undefined}
        newLabel={t("points.new")}
      >
        <RideSubnav active="points" />
      </AdminPageHeader>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid min-w-60 gap-1.5">
          <Label htmlFor="pt-zone">{t("points.zone")}</Label>
          <NativeSelect id="pt-zone" name="zone" defaultValue={zoneId ?? ""}>
            <option value="">{t("points.allZones")}</option>
            {zones.map((zn) => (
              <option key={zn.id} value={zn.id}>
                {zoneName.get(zn.id)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          {t("points.filter")}
        </Button>
      </form>
      {zones.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
          {t("points.noZones")}
        </p>
      ) : (
        <DataTable
          rows={points.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            zone: zoneName.get(p.zone_id) ?? "–",
            kind: t(`points.kinds.${p.kind}`),
            coords: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
            popular: p.is_popular,
            active: p.is_active,
            sort: p.sort_order,
          }))}
          editHref={canWrite ? "/admin/rides/points" : undefined}
          columns={[
            { key: "name", header: t("fields.name"), kind: "localized" },
            { key: "slug", header: t("fields.slug") },
            { key: "zone", header: t("points.zone") },
            { key: "kind", header: t("points.kind"), kind: "badge" },
            { key: "coords", header: t("fields.coords"), sortable: false },
            { key: "popular", header: t("fields.popular"), kind: "boolean" },
            { key: "active", header: t("fields.active"), kind: "boolean" },
            { key: "sort", header: t("fields.sortOrder"), kind: "number" },
          ]}
        />
      )}
    </div>
  );
}
