import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AdminSubnav, AdminPageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { RideFareGrid } from "@/components/admin/ride-fare-grid";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { listRideFareRules, listVehicleTypes, listZones } from "@/lib/rides/admin";
import { nightBpsToPercentInput, rideFareGridValues } from "@/lib/rides/admin-rows";

/** One zone's fares (`?zone=<id>`, first zone by default): a grid for rides.write staff, a table for readers. */
export default async function RideFaresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("rides.read", "/admin/rides/fares");
  const canWrite = hasPermission(session.permissions, "rides.write");
  const [t, locale, zones, types, query] = await Promise.all([
    getTranslations("admin.rides"),
    getLocale(),
    listZones(),
    listVehicleTypes(),
    searchParams,
  ]);
  const raw = Array.isArray(query.zone) ? query.zone[0] : query.zone;
  const wanted = z.uuid().safeParse(raw);
  const zone = zones.find((zn) => wanted.success && zn.id === wanted.data) ?? zones[0];
  const rules = zone ? await listRideFareRules(zone.id) : [];
  const typeName = new Map(types.map((v) => [v.id, pickLocalized(v.name, locale)]));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("fares.title")} lead={t("fares.lead")}>
        <RideSubnav active="fares" />
      </AdminPageHeader>
      {!zone || types.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
          {t("fares.noSetup")}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("fares.zone")}</p>
            <AdminSubnav
              active={zone.id}
              items={zones.map((zn) => ({
                key: zn.id,
                href: `/admin/rides/fares?zone=${zn.id}`,
                label: pickLocalized(zn.name, locale),
              }))}
            />
          </div>
          {canWrite ? (
            <RideFareGrid
              key={zone.id}
              defaultValues={rideFareGridValues(zone.id, types, rules)}
              types={types.map((v) => ({ value: v.id, label: v.name }))}
            />
          ) : (
            <DataTable
              rows={rules.map((r) => ({
                id: r.id,
                type: typeName.get(r.vehicle_type_id) ?? "–",
                mode: t(`modes.${r.mode}`),
                fare:
                  r.mode === "hourly"
                    ? `${formatPaise(r.hourly_rate_paise, locale)} × ${r.min_hours}+`
                    : `${formatPaise(r.base_paise, locale)} + ${formatPaise(r.per_km_paise, locale)}/km`,
                minimum: formatPaise(r.min_fare_paise, locale),
                night: `+${nightBpsToPercentInput(r.night_bps)}%`,
                active: r.is_active,
              }))}
              columns={[
                { key: "type", header: t("fares.vehicleType") },
                { key: "mode", header: t("fares.mode") },
                { key: "fare", header: t("fares.fare"), sortable: false },
                { key: "minimum", header: t("fares.minFare"), sortable: false },
                { key: "night", header: t("fares.night"), sortable: false },
                { key: "active", header: t("fields.active"), kind: "boolean" },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
