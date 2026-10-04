import { getLocale, getTranslations } from "next-intl/server";
import { FleetAlerts } from "@/components/admin/cab-expiry";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { TripCard, type AssignOptions } from "@/components/admin/cab-trip-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SectionJumpNav } from "@/components/admin/section-jump-nav";
import { requirePermission } from "@/lib/auth/guards";
import {
  getAssignOptions,
  getFleetAlerts,
  listCategories,
  listDispatchTrips,
  tripLookups,
} from "@/lib/cabs/admin";
import { dispatchGroup, vehicleChoices, type DispatchGroup } from "@/lib/cabs/admin-rows";
import { hasPermission } from "@/lib/permissions/check";

const GROUPS: readonly DispatchGroup[] = ["unassigned", "assigned", "inProgress"];

/**
 * Dispatch board: paid trips waiting for a driver, assigned, and under
 * way, soonest pickup first. Fleet papers that need attention are flagged
 * at the top.
 */
export default async function CabsDispatchPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const locale = await getLocale();
  const [t, trips, lookups, alerts, categories, assign] = await Promise.all([
    getTranslations("cabsAdmin"),
    listDispatchTrips(),
    tripLookups(locale),
    getFleetAlerts(),
    listCategories(),
    canWrite ? getAssignOptions() : null,
  ]);

  let options: AssignOptions | null = null;
  if (assign) {
    const booked = [...new Set(trips.map((trip) => trip.category_id))];
    options = {
      drivers: assign.drivers.map((d) => ({ value: d.id, label: `${d.full_name} · ${d.phone}` })),
      vehiclesByCategory: new Map(booked.map((id) => [id, vehicleChoices(id, categories, assign.vehicles)])),
    };
  }
  const now = Date.now();

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("dispatch.lead")}>
        <CabSubnav active="dispatch" />
      </AdminPageHeader>
      <FleetAlerts alerts={alerts} />
      {trips.length > 0 ? (
        <SectionJumpNav
          className="xl:hidden"
          label={t("nav.dispatch")}
          items={GROUPS.map((group) => ({
            id: `group-${group}`,
            label: t(`dispatch.groups.${group}`),
            count: trips.filter((trip) => dispatchGroup(trip.status) === group).length,
          }))}
        />
      ) : null}
      {trips.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
          {t("dispatch.empty")}
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {GROUPS.map((group) => {
            const rows = trips.filter((trip) => dispatchGroup(trip.status) === group);
            return (
              <section
                key={group}
                id={`group-${group}`}
                aria-labelledby={`group-${group}-title`}
                className="space-y-3"
              >
                <h2 id={`group-${group}-title`} className="flex items-center gap-2 text-base font-semibold">
                  {t(`dispatch.groups.${group}`)}
                  <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground">
                    {rows.length}
                  </span>
                </h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dispatch.emptyGroup")}</p>
                ) : (
                  <ul className="space-y-3">
                    {rows.map((trip) => (
                      <TripCard key={trip.id} trip={trip} lookups={lookups} options={options} now={now} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
