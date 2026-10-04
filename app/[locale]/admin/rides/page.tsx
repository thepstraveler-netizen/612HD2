import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SectionJumpNav } from "@/components/admin/section-jump-nav";
import { RideAutoRefresh } from "@/components/admin/ride-auto-refresh";
import { RideBoardFiltersForm, RideBoardRow } from "@/components/admin/ride-board";
import { RideSubnav } from "@/components/admin/ride-subnav";
import { requirePermission } from "@/lib/auth/guards";
import { listBoardRides, rideLookups } from "@/lib/rides/admin";
import { parseRideBoardFilters, rideBoardGroup } from "@/lib/rides/admin-rows";
import { RIDE_BOARD_GROUPS } from "@/schemas/ride-admin";

/**
 * Live ride requests: new requests first, then rides under way, then the
 * recently finished ones. The page re-renders itself every 20 seconds
 * while the tab is visible.
 */
export default async function RidesBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("rides.read", "/admin/rides");
  const filters = parseRideBoardFilters(await searchParams);
  const locale = await getLocale();
  const [t, tUi, rides, lookups] = await Promise.all([
    getTranslations("admin.rides"),
    getTranslations("admin.ui"),
    listBoardRides(filters),
    rideLookups(locale),
  ]);
  const now = Date.now();
  // Newest finished rides first; open ones by pickup time.
  const groups = RIDE_BOARD_GROUPS.map((group) => {
    const rows = rides.filter((r) => rideBoardGroup(r.status) === group);
    return { group, rows: group === "finished" ? rows.reverse() : rows };
  });
  const other = rides.filter((r) => rideBoardGroup(r.status) === null);

  return (
    <div className="space-y-6">
      <RideAutoRefresh seconds={20} />
      <AdminPageHeader title={t("title")} lead={t("board.lead")}>
        <RideSubnav active="board" />
      </AdminPageHeader>
      <RideBoardFiltersForm filters={filters} />
      {rides.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{t("board.empty")}</p>
      ) : (
        <>
          <SectionJumpNav
            className="xl:hidden"
            label={tUi("jumpTo")}
            items={groups.map(({ group, rows }) => ({
              id: `rides-${group}`,
              label: t(`board.groups.${group}`),
              count: rows.length,
            }))}
          />
          <div className="grid gap-6 xl:grid-cols-3">
            {groups.map(({ group, rows }) => (
              <section
                key={group}
                id={`rides-${group}`}
                aria-labelledby={`group-${group}`}
                className="scroll-mt-32 space-y-3"
              >
                <h2 id={`group-${group}`} className="flex items-center gap-2 text-base font-semibold">
                  {t(`board.groups.${group}`)}
                  <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground">
                    {rows.length}
                  </span>
                </h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("board.emptyGroup")}</p>
                ) : (
                  <ul className="space-y-3">
                    {rows.map((ride) => (
                      <RideBoardRow key={ride.id} ride={ride} lookups={lookups} now={now} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
            {other.length ? (
              <section aria-labelledby="group-other" className="space-y-3 xl:col-span-3">
                <h2 id="group-other" className="text-base font-semibold">
                  {t("status.awaiting_payment")}
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {other.map((ride) => (
                    <RideBoardRow key={ride.id} ride={ride} lookups={lookups} now={now} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
