import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LazyHorizontalBarChart, LazyTrendChart } from "@/components/admin/insights-charts-lazy";
import { InsightCard, KpiCard, ReportRangeBar } from "@/components/admin/insights-shared";
import { AdminPageHeader, AdminSubnav } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { formatBps } from "@/lib/reports/format";
import { getReport } from "@/lib/reports/queries";
import { parseReportRange, rangeQuery, type ReportRange } from "@/lib/reports/range";
import { cancellationsByService, salesByDay, sumSales, type ReportRows } from "@/lib/reports/rows";
import { REPORT_KEYS, type ReportKey } from "@/schemas/engagement-admin";

type Ctx = {
  t: Awaited<ReturnType<typeof getTranslations>>;
  service: (s: string) => string;
  locale: string;
  range: ReportRange;
  can: (p: "vendors.read" | "hotels.read" | "offers.read") => boolean;
};

const right = (value: ReactNode, bold = false) => (
  <span className={`block text-right whitespace-nowrap tabular-nums ${bold ? "font-semibold" : ""}`}>
    {value}
  </span>
);

function money(paise: number, ctx: Ctx) {
  return formatPaise(paise, ctx.locale);
}

function num(n: number, ctx: Ctx) {
  return n.toLocaleString(ctx.locale === "hi" ? "hi-IN" : "en-IN");
}

function head(labels: string[], numericFrom: number): ReactNode[] {
  return labels.map((l, i) =>
    i >= numericFrom ? (
      <span key={l} className="block text-right">
        {l}
      </span>
    ) : (
      l
    ),
  );
}

function Sales({ rows, ctx }: { rows: ReportRows["sales"]; ctx: Ctx }) {
  const { t } = ctx;
  const totals = sumSales(rows);
  const c = (k: string) => t(`columns.${k}`);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <KpiCard label={c("revenue")} value={money(totals.revenue_paise, ctx)} />
        </li>
        <li>
          <KpiCard label={c("bookings")} value={num(totals.bookings, ctx)} />
        </li>
        <li>
          <KpiCard label={c("total")} value={money(totals.total_paise, ctx)} />
        </li>
        <li>
          <KpiCard label={c("refunded")} value={money(totals.refunded_paise, ctx)} />
        </li>
      </ul>
      <InsightCard title={t("charts.salesTrend")}>
        <LazyTrendChart
          points={salesByDay(rows, ctx.range.from, ctx.range.to)}
          locale={ctx.locale}
          labels={{ revenue: c("revenue"), bookings: c("bookings"), metric: t("charts.metric") }}
        />
      </InsightCard>
      <AdminTable
        empty={t("empty")}
        headers={head(
          [
            c("date"),
            c("service"),
            c("created"),
            c("bookings"),
            c("total"),
            c("discount"),
            c("tax"),
            c("refunded"),
            c("revenue"),
          ],
          2,
        )}
        rows={[
          ...rows.map((r) => ({
            key: `${r.day}-${r.service}`,
            cells: [
              <span key="d" className="whitespace-nowrap">
                {r.day}
              </span>,
              ctx.service(r.service),
              right(num(r.created, ctx)),
              right(num(r.bookings, ctx)),
              right(money(r.total_paise, ctx)),
              right(money(r.discount_paise, ctx)),
              right(money(r.tax_paise, ctx)),
              right(money(r.refunded_paise, ctx)),
              right(money(r.revenue_paise, ctx)),
            ],
          })),
          ...(rows.length
            ? [
                {
                  key: "total",
                  cells: [
                    <span key="t" className="font-semibold">
                      {t("total")}
                    </span>,
                    "",
                    right(num(totals.created, ctx), true),
                    right(num(totals.bookings, ctx), true),
                    right(money(totals.total_paise, ctx), true),
                    right(money(totals.discount_paise, ctx), true),
                    right(money(totals.tax_paise, ctx), true),
                    right(money(totals.refunded_paise, ctx), true),
                    right(money(totals.revenue_paise, ctx), true),
                  ],
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function Occupancy({ rows, ctx }: { rows: ReportRows["occupancy"]; ctx: Ctx }) {
  const { t } = ctx;
  const c = (k: string) => t(`columns.${k}`);
  const name = (n: unknown) => pickLocalized(n as LocalizedJson, ctx.locale);
  const sold = rows.reduce((s, r) => s + r.sold_nights, 0);
  const available = rows.reduce((s, r) => s + r.available_nights, 0);
  const revenue = rows.reduce((s, r) => s + r.room_revenue_paise, 0);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <KpiCard
            label={c("occupancy")}
            value={formatBps(available ? Math.round((sold * 10_000) / available) : 0, ctx.locale)}
          />
        </li>
        <li>
          <KpiCard label={c("soldNights")} value={num(sold, ctx)} />
        </li>
        <li>
          <KpiCard label={c("roomRevenue")} value={money(revenue, ctx)} />
        </li>
        <li>
          <KpiCard label={c("adr")} value={money(sold ? Math.round(revenue / sold) : 0, ctx)} />
        </li>
      </ul>
      {rows.some((r) => r.sold_nights > 0) ? (
        <InsightCard title={t("charts.occupancy")}>
          <LazyHorizontalBarChart
            points={rows.slice(0, 10).map((r) => ({ label: name(r.hotel_name), value: r.sold_nights }))}
            locale={ctx.locale}
            money={false}
            valueLabel={c("soldNights")}
          />
        </InsightCard>
      ) : null}
      <AdminTable
        empty={t("empty")}
        headers={head(
          [
            c("hotel"),
            c("rooms"),
            c("availableNights"),
            c("soldNights"),
            c("occupancy"),
            c("roomRevenue"),
            c("adr"),
          ],
          1,
        )}
        rows={rows.map((r) => ({
          key: r.hotel_id,
          cells: [
            ctx.can("hotels.read") ? (
              <Link key="h" href={`/admin/hotels/${r.hotel_id}`} className="text-primary">
                {name(r.hotel_name)}
              </Link>
            ) : (
              name(r.hotel_name)
            ),
            right(num(r.rooms, ctx)),
            right(num(r.available_nights, ctx)),
            right(num(r.sold_nights, ctx)),
            right(formatBps(r.occupancy_bps, ctx.locale)),
            right(money(r.room_revenue_paise, ctx)),
            right(money(r.adr_paise, ctx)),
          ],
        }))}
      />
    </>
  );
}

function Vendors({ rows, ctx }: { rows: ReportRows["vendors"]; ctx: Ctx }) {
  const { t } = ctx;
  const c = (k: string) => t(`columns.${k}`);
  return (
    <AdminTable
      empty={t("empty")}
      headers={head(
        [c("vendor"), c("bookings"), c("cancelled"), c("gmv"), c("commission"), c("net"), c("rating")],
        1,
      )}
      rows={rows.map((r) => ({
        key: r.vendor_id,
        cells: [
          ctx.can("vendors.read") ? (
            <Link key="v" href={`/admin/vendors/${r.vendor_id}`} className="text-primary">
              {r.vendor_name}
            </Link>
          ) : (
            r.vendor_name
          ),
          right(num(r.bookings, ctx)),
          right(num(r.cancelled, ctx)),
          right(money(r.gmv_paise, ctx)),
          right(money(r.commission_paise, ctx)),
          right(money(r.net_paise, ctx)),
          right(r.rating_avg != null ? `${r.rating_avg} (${num(r.rating_count, ctx)})` : "—"),
        ],
      }))}
    />
  );
}

function Agents({ rows, ctx }: { rows: ReportRows["agents"]; ctx: Ctx }) {
  const { t } = ctx;
  const c = (k: string) => t(`columns.${k}`);
  return (
    <AdminTable
      empty={t("empty")}
      headers={head(
        [
          c("agent"),
          c("leads"),
          c("contacted"),
          c("quoted"),
          c("won"),
          c("lost"),
          c("open"),
          c("winRate"),
          c("wonValue"),
          c("calls"),
        ],
        1,
      )}
      rows={rows.map((r) => ({
        key: r.agent_id ?? "unassigned",
        cells: [
          r.agent_id ? (
            <span key="a" className="block">
              {r.agent_name ?? r.agent_email ?? r.agent_id}
              {r.agent_name && r.agent_email ? (
                <span className="block text-xs text-muted-foreground">{r.agent_email}</span>
              ) : null}
            </span>
          ) : (
            <span key="a" className="text-muted-foreground">
              {t("unassigned")}
            </span>
          ),
          right(num(r.leads, ctx)),
          right(num(r.contacted, ctx)),
          right(num(r.quoted, ctx)),
          right(num(r.won, ctx)),
          right(num(r.lost, ctx)),
          right(num(r.open, ctx)),
          right(formatBps(r.win_rate_bps, ctx.locale)),
          right(money(r.won_value_paise, ctx)),
          right(num(r.calls, ctx)),
        ],
      }))}
    />
  );
}

function Coupons({ rows, ctx }: { rows: ReportRows["coupons"]; ctx: Ctx }) {
  const { t } = ctx;
  const c = (k: string) => t(`columns.${k}`);
  return (
    <AdminTable
      empty={t("empty")}
      headers={head([c("code"), c("redemptions"), c("released"), c("customers"), c("discount"), c("gmv")], 1)}
      rows={rows.map((r) => ({
        key: r.coupon_id ?? r.code,
        cells: [
          r.kind === "reward" ? (
            <span key="c">{t("rewardCodes")}</span>
          ) : ctx.can("offers.read") && r.coupon_id ? (
            <Link key="c" href={`/admin/offers/coupons/${r.coupon_id}`} className="font-mono text-primary">
              {r.code}
            </Link>
          ) : (
            <span key="c" className="font-mono">
              {r.code}
            </span>
          ),
          right(num(r.redemptions, ctx)),
          right(num(r.released, ctx)),
          right(num(r.customers, ctx)),
          right(money(r.discount_paise, ctx)),
          right(money(r.gmv_paise, ctx)),
        ],
      }))}
    />
  );
}

function Cancellations({ rows, ctx }: { rows: ReportRows["cancellations"]; ctx: Ctx }) {
  const { t } = ctx;
  const c = (k: string) => t(`columns.${k}`);
  const byService = cancellationsByService(rows);
  const refunded = rows.reduce((s, r) => s + r.refunded_paise, 0);
  const total = rows.reduce((s, r) => s + r.cancellations, 0);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <KpiCard label={c("cancellations")} value={num(total, ctx)} />
        </li>
        <li>
          <KpiCard label={c("refunded")} value={money(refunded, ctx)} />
        </li>
      </ul>
      {byService.length ? (
        <InsightCard title={t("charts.cancellations")}>
          <LazyHorizontalBarChart
            points={byService.map((s) => ({ label: ctx.service(s.service), value: s.count }))}
            locale={ctx.locale}
            money={false}
            valueLabel={c("cancellations")}
          />
        </InsightCard>
      ) : null}
      <AdminTable
        empty={t("empty")}
        headers={head(
          [
            c("service"),
            c("cancelledBy"),
            c("reason"),
            c("cancellations"),
            c("total"),
            c("paid"),
            c("refunded"),
          ],
          3,
        )}
        rows={rows.map((r, i) => ({
          key: `${r.service}-${r.cancelled_by}-${i}`,
          cells: [
            ctx.service(r.service),
            t(
              `cancelledBy.${r.cancelled_by === "customer" || r.cancelled_by === "staff" ? r.cancelled_by : "system"}`,
            ),
            r.reason ? (
              <span key="r" className="block max-w-xs break-words">
                {r.reason}
              </span>
            ) : (
              <span key="r" className="text-muted-foreground">
                {t("noReason")}
              </span>
            ),
            right(num(r.cancellations, ctx)),
            right(money(r.total_paise, ctx)),
            right(money(r.paid_paise, ctx)),
            right(money(r.refunded_paise, ctx)),
          ],
        }))}
      />
    </>
  );
}

/** One admin report: date range, figures, chart where it helps, table, CSV export. */
export default async function AdminReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { report } = await params;
  if (!(REPORT_KEYS as readonly string[]).includes(report)) notFound();
  const key = report as ReportKey;
  const session = await requirePermission("reports.read", `/admin/reports/${key}`);
  const range = parseReportRange(await searchParams, todayInIndia());
  const [t, tBookings, locale] = await Promise.all([
    getTranslations("reportsAdmin"),
    getTranslations("bookingsAdmin"),
    getLocale(),
  ]);
  const ctx: Ctx = {
    t,
    locale,
    range,
    service: (s) => (tBookings.has(`services.${s}`) ? tBookings(`services.${s}`) : s),
    can: (p) => hasPermission(session.permissions, p),
  };
  const query = rangeQuery(range);

  let body: ReactNode;
  switch (key) {
    case "sales":
      body = <Sales rows={await getReport("sales", range.from, range.to)} ctx={ctx} />;
      break;
    case "occupancy":
      body = <Occupancy rows={await getReport("occupancy", range.from, range.to)} ctx={ctx} />;
      break;
    case "vendors":
      body = <Vendors rows={await getReport("vendors", range.from, range.to)} ctx={ctx} />;
      break;
    case "agents":
      body = <Agents rows={await getReport("agents", range.from, range.to)} ctx={ctx} />;
      break;
    case "coupons":
      body = <Coupons rows={await getReport("coupons", range.from, range.to)} ctx={ctx} />;
      break;
    case "cancellations":
      body = <Cancellations rows={await getReport("cancellations", range.from, range.to)} ctx={ctx} />;
      break;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t(`reports.${key}.title`)}
        lead={t(`reports.${key}.lead`)}
        backHref={`/admin/reports?${query}`}
        backLabel={t("back")}
      >
        <AdminSubnav
          active={key}
          items={REPORT_KEYS.map((k) => ({
            key: k,
            href: `/admin/reports/${k}?${query}`,
            label: t(`reports.${k}.short`),
          }))}
        />
      </AdminPageHeader>
      <ReportRangeBar
        basePath={`/admin/reports/${key}`}
        range={range}
        csvHref={`/api/admin/reports/${key}?${query}`}
      />
      {body}
      <p className="text-sm text-muted-foreground">{t(`reports.${key}.basis`)}</p>
    </div>
  );
}
