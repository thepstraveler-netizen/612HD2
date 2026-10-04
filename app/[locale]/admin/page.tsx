import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LazyHorizontalBarChart, LazyTrendChart } from "@/components/admin/insights-charts-lazy";
import { InsightCard, KpiCard, ReportRangeBar } from "@/components/admin/insights-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ADMIN_MODULE_DEFS, adminModuleHref } from "@/lib/admin/modules";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions/constants";
import { hasPermission, visibleModules } from "@/lib/permissions/check";
import { formatBps } from "@/lib/reports/format";
import { DASHBOARD_FIGURE_PERMISSIONS, getDashboard, getPendingActionCounts } from "@/lib/reports/queries";
import { parseReportRange, rangeQuery } from "@/lib/reports/range";
import { canSeePendingActions, visiblePendingActions } from "@/lib/reports/rows";
import type { PermissionKey } from "@/lib/permissions/constants";

/**
 * Admin home. Everyone with dashboard.read sees the "Needs attention" list
 * (only the items they may open) and their modules; staff with reports.read
 * or payments.read also see the figures for the chosen date range.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("dashboard.read", "/admin");
  const can = (p: PermissionKey) => hasPermission(session.permissions, p);
  const canFigures = DASHBOARD_FIGURE_PERMISSIONS.some(can);
  const range = parseReportRange(await searchParams, todayInIndia());
  const [t, tAdmin, tBookings, tCabs, locale, data, pendingCounts] = await Promise.all([
    getTranslations("dashboardAdmin"),
    getTranslations("admin"),
    getTranslations("bookingsAdmin"),
    getTranslations("cabsAdmin"),
    getLocale(),
    canFigures ? getDashboard(range.from, range.to) : Promise.resolve(null),
    canSeePendingActions(can) ? getPendingActionCounts() : Promise.resolve(null),
  ]);
  const allowed = new Set(visibleModules(session.permissions));
  const money = (paise: number) => formatPaise(paise, locale);
  const num = (n: number) => n.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN");
  const pending = pendingCounts ? visiblePendingActions(pendingCounts, can) : [];
  const waiting = pending.filter((a) => a.count > 0);
  const serviceLabel = (s: string) => (tBookings.has(`services.${s}`) ? tBookings(`services.${s}`) : s);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[length:var(--text-title)] font-bold">{tAdmin("modules.dashboard")}</h1>
        <p className="text-muted-foreground">{canFigures ? t("lead") : t("leadAgent")}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{tAdmin("yourRoles")}</span>
          {session.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {ROLE_LABELS[role as RoleKey] ?? role}
            </Badge>
          ))}
        </div>
      </div>

      {pendingCounts ? (
        <InsightCard title={t("attention.title")}>
          {waiting.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-accent-green" aria-hidden="true" /> {t("attention.clear")}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {waiting.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <AlertCircle className="size-4 shrink-0 text-accent-amber" aria-hidden="true" />
                    <span className="flex-1">{t(`attention.items.${a.key}`, { count: a.count })}</span>
                    <span className="rounded-full bg-accent-amber/15 px-2 py-0.5 font-semibold text-accent-amber tabular-nums">
                      {num(a.count)}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>
      ) : null}

      {data ? (
        <>
          <ReportRangeBar basePath="/admin" range={range} />
          <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <li>
              <KpiCard
                label={t("kpi.revenue")}
                value={money(data.revenue_paise)}
                hint={t("kpi.revenueHint")}
              />
            </li>
            <li>
              <KpiCard label={t("kpi.bookings")} value={num(data.bookings)} hint={t("kpi.bookingsHint")} />
            </li>
            <li>
              <KpiCard
                label={t("kpi.conversion")}
                value={formatBps(data.conversion_bps, locale)}
                hint={t("kpi.conversionHint", { converted: data.converted, created: data.created })}
              />
            </li>
            <li>
              <KpiCard label={t("kpi.aov")} value={money(data.aov_paise)} hint={t("kpi.aovHint")} />
            </li>
            <li>
              <KpiCard label={t("kpi.gmv")} value={money(data.gmv_paise)} hint={t("kpi.gmvHint")} />
            </li>
            <li>
              <KpiCard label={t("kpi.discounts")} value={money(data.discount_paise)} />
            </li>
            <li>
              <KpiCard label={t("kpi.cancelled")} value={num(data.cancelled)} />
            </li>
            <li>
              <KpiCard label={t("kpi.newCustomers")} value={num(data.new_customers)} />
            </li>
          </ul>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <InsightCard title={t("charts.trend")}>
                <LazyTrendChart
                  points={data.series}
                  locale={locale}
                  labels={{
                    revenue: t("kpi.revenue"),
                    bookings: t("kpi.bookings"),
                    metric: t("charts.metric"),
                  }}
                />
              </InsightCard>
            </div>
            <InsightCard title={t("charts.byService")}>
              {data.by_service.some((s) => s.bookings > 0) ? (
                <>
                  <LazyHorizontalBarChart
                    points={data.by_service
                      .filter((s) => s.bookings > 0)
                      .map((s) => ({ label: serviceLabel(s.service), value: s.gmv_paise }))}
                    locale={locale}
                    money
                    valueLabel={t("kpi.gmv")}
                  />
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t("charts.byService")}</caption>
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-1 text-left font-medium">
                          {t("table.service")}
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          {t("kpi.bookings")}
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          {t("kpi.revenue")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_service
                        .filter((s) => s.bookings > 0)
                        .map((s) => (
                          <tr key={s.service} className="border-t">
                            <td className="py-1.5">{serviceLabel(s.service)}</td>
                            <td className="py-1.5 text-right tabular-nums">{num(s.bookings)}</td>
                            <td className="py-1.5 text-right tabular-nums">{money(s.revenue_paise)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              )}
            </InsightCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <InsightCard
              title={t("top.hotels")}
              action={
                can("reports.read") ? (
                  <Link
                    href={`/admin/reports/occupancy?${rangeQuery(range)}`}
                    className="text-sm text-primary"
                  >
                    {t("top.occupancy")}
                  </Link>
                ) : null
              }
            >
              {data.top_hotels.length ? (
                <ol className="grid gap-2 text-sm">
                  {data.top_hotels.map((h, i) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {can("hotels.read") ? (
                          <Link href={`/admin/hotels/${h.id}`} className="text-primary">
                            {pickLocalized(h.name, locale)}
                          </Link>
                        ) : (
                          pickLocalized(h.name, locale)
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("top.bookings", { count: h.bookings })}
                      </span>
                      <span className="font-medium tabular-nums">{money(h.gmv_paise)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              )}
            </InsightCard>
            <InsightCard title={t("top.routes")}>
              {data.top_routes.length ? (
                <ol className="grid gap-2 text-sm">
                  {data.top_routes.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {pickLocalized(r.from_name, locale)}
                          {r.to_name ? ` → ${pickLocalized(r.to_name, locale)}` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {tCabs.has(`tripTypes.${r.trip_type}`)
                            ? tCabs(`tripTypes.${r.trip_type}`)
                            : r.trip_type}
                        </span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("top.bookings", { count: r.bookings })}
                      </span>
                      <span className="font-medium tabular-nums">{money(r.gmv_paise)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              )}
            </InsightCard>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {can("reports.read") ? (
              <Link href={`/admin/reports?${rangeQuery(range)}`} className="font-medium text-primary">
                {t("links.reports")}
              </Link>
            ) : null}
            {can("payments.read") ? (
              <Link href="/admin/payments/settlements/report" className="font-medium text-primary">
                {t("links.commission")}
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("basis")}</p>
        </>
      ) : null}

      <section className="space-y-3" aria-labelledby="admin-modules">
        <h2 id="admin-modules" className="text-lg font-semibold">
          {t("modules")}
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          {ADMIN_MODULE_DEFS.filter((m) => m.key !== "dashboard" && allowed.has(m.key)).map(
            ({ key, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={adminModuleHref(key)}
                  className="block h-full rounded-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full justify-center py-3 transition hover:shadow-md sm:py-6">
                    <CardHeader className="px-3 sm:px-6">
                      <CardTitle className="flex items-center gap-2 text-sm leading-tight sm:text-base sm:leading-none">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        {tAdmin(`modules.${key}`)}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
