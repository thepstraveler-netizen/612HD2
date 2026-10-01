import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { indiaTime, tripRouteText } from "@/components/admin/cab-trip-card";
import { TripFiltersForm } from "@/components/admin/cab-trip-filters";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { TRIPS_PAGE_SIZE, listTrips, tripLookups } from "@/lib/cabs/admin";
import { parseTripFilters, tripFiltersQuery, tripTone } from "@/lib/cabs/admin-rows";

/** Every trip in any status, latest pickup first; filters and paging run in the database. */
export default async function CabTripsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("cabs.read", "/admin/cabs/trips");
  const filters = parseTripFilters(await searchParams);
  const locale = await getLocale();
  const [t, format, { rows, total }, lookups] = await Promise.all([
    getTranslations("cabsAdmin"),
    getFormatter(),
    listTrips(filters),
    tripLookups(locale),
  ]);
  const pages = Math.max(1, Math.ceil(total / TRIPS_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("trips.title")} lead={t("trips.lead")}>
        <CabSubnav active="trips" />
      </AdminPageHeader>
      <TripFiltersForm filters={filters} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("trips.results", { count: total })}
      </p>
      <DataTable
        pageSize={TRIPS_PAGE_SIZE}
        editHref="/admin/cabs/trips"
        editLabel={t("trips.view")}
        rows={rows.map((trip) => ({
          id: trip.id,
          pickup: indiaTime(format, trip.pickup_at),
          booking: trip.booking?.code ?? "–",
          type: t(`tripTypes.${trip.trip_type}`),
          route: tripRouteText(trip, lookups),
          category: lookups.categories.get(trip.category_id) ?? "–",
          passengers: trip.passengers,
          driver: trip.driver_name ? `${trip.driver_name} · ${trip.vehicle_registration ?? ""}` : "–",
          status: { label: t(`status.${trip.status}`), tone: tripTone(trip.status) },
        }))}
        columns={[
          { key: "pickup", header: t("trips.columns.pickup"), sortable: false },
          { key: "booking", header: t("trips.columns.booking") },
          { key: "type", header: t("trips.columns.type") },
          { key: "route", header: t("trips.columns.route") },
          { key: "category", header: t("trips.columns.category") },
          { key: "passengers", header: t("trips.columns.passengers"), kind: "number" },
          { key: "driver", header: t("trips.columns.driver") },
          { key: "status", header: t("trips.columns.status"), kind: "tone" },
        ]}
      />
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t("trips.pagination.label")}>
          <span className="text-muted-foreground">
            {t("trips.pagination.page", { page: filters.page, pages })}
          </span>
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/cabs/trips${tripFiltersQuery(filters, filters.page - 1)}`}>
                {t("trips.pagination.prev")}
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/cabs/trips${tripFiltersQuery(filters, filters.page + 1)}`}>
                {t("trips.pagination.next")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
