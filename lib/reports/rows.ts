import { z } from "zod";
import { dateRange } from "@/lib/dates";
import { toCsv, type CsvValue } from "@/lib/hotels/csv";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import type { PermissionKey } from "@/lib/permissions/constants";
import type { ReportKey } from "@/schemas/engagement-admin";
import type { Database } from "@/types/database";

/**
 * Pure helpers for the admin dashboard and Admin → Reports: the shapes the
 * report functions return, the pending-action list (who may see what), KPI
 * formatting and the CSV builders (amounts in rupees, formula-safe cells via
 * lib/hotels/csv).
 */

type Fn = Database["public"]["Functions"];
export type SalesRow = Fn["report_sales"]["Returns"][number];
export type OccupancyRow = Fn["report_occupancy"]["Returns"][number];
export type VendorPerformanceRow = Fn["report_vendor_performance"]["Returns"][number];
export type AgentPerformanceRow = Fn["report_agent_performance"]["Returns"][number];
export type CouponUsageRow = Fn["report_coupon_usage"]["Returns"][number];
export type CancellationRow = Fn["report_cancellations"]["Returns"][number];

export type ReportRows = {
  sales: SalesRow[];
  occupancy: OccupancyRow[];
  vendors: VendorPerformanceRow[];
  agents: AgentPerformanceRow[];
  coupons: CouponUsageRow[];
  cancellations: CancellationRow[];
};

// ---------------------------------------------------------------- dashboard

const count = z.coerce.number().int().catch(0);
const localized = z
  .object({ en: z.string(), hi: z.string().nullish() })
  .catch({ en: "" })
  .transform((v) => v as LocalizedJson);

export const dashboardSchema = z.object({
  bookings: count,
  created: count,
  converted: count,
  revenue_paise: count,
  gmv_paise: count,
  discount_paise: count,
  cancelled: count,
  customers: count,
  new_customers: count,
  conversion_bps: count,
  aov_paise: count,
  by_service: z
    .array(z.object({ service: z.string(), bookings: count, revenue_paise: count, gmv_paise: count }))
    .catch([]),
  series: z
    .array(z.object({ day: z.string(), bookings: count, created: count, revenue_paise: count }))
    .catch([]),
  top_hotels: z
    .array(
      z.object({ id: z.string(), name: localized, bookings: count, gmv_paise: count, revenue_paise: count }),
    )
    .catch([]),
  top_routes: z
    .array(
      z.object({
        from_name: localized,
        to_name: localized.nullable().catch(null),
        trip_type: z.string(),
        bookings: count,
        gmv_paise: count,
      }),
    )
    .catch([]),
});
export type DashboardData = z.output<typeof dashboardSchema>;

export function parseDashboard(value: unknown): DashboardData {
  return dashboardSchema.parse(value ?? {});
}

export const PENDING_ACTIONS = [
  { key: "unassigned_trips", permission: "cabs.read", href: "/admin/cabs/trips?status=unassigned" },
  { key: "requested_rides", permission: "rides.read", href: "/admin/rides" },
  { key: "new_leads", permission: "leads.read", href: "/admin/leads?view=list&status=new" },
  { key: "overdue_follow_ups", permission: "leads.read", href: "/admin/leads?view=list&due=overdue" },
  { key: "pending_applications", permission: "vendors.read", href: "/admin/vendors/applications" },
  { key: "pending_reviews", permission: "reviews.read", href: "/admin/reviews" },
  { key: "open_refunds", permission: "payments.read", href: "/admin/payments/refunds" },
  { key: "pending_payouts", permission: "payments.read", href: "/admin/payments/settlements/payouts" },
  { key: "low_stock_food", permission: "food.read", href: "/admin/food/stores" },
  { key: "low_stock_medicine", permission: "medicine.read", href: "/admin/medicine/pharmacies" },
] as const satisfies readonly { key: string; permission: PermissionKey; href: string }[];

export type PendingActionKey = (typeof PENDING_ACTIONS)[number]["key"];
export type PendingAction = (typeof PENDING_ACTIONS)[number] & { count: number };

/** The pending actions this viewer may open, with their counts (zeros included, in a fixed order). */
export function visiblePendingActions(
  counts: unknown,
  can: (permission: PermissionKey) => boolean,
): PendingAction[] {
  const record = (counts && typeof counts === "object" ? counts : {}) as Record<string, unknown>;
  return PENDING_ACTIONS.filter((a) => can(a.permission)).map((a) => ({
    ...a,
    count: Math.max(0, Math.trunc(Number(record[a.key]) || 0)),
  }));
}

/** Whether any pending action is visible to a viewer with these permissions. */
export function canSeePendingActions(can: (permission: PermissionKey) => boolean): boolean {
  return PENDING_ACTIONS.some((a) => can(a.permission));
}

/** Totals of the sales report rows. */
export function sumSales(rows: readonly SalesRow[]) {
  return rows.reduce(
    (t, r) => ({
      created: t.created + r.created,
      bookings: t.bookings + r.bookings,
      discount_paise: t.discount_paise + r.discount_paise,
      tax_paise: t.tax_paise + r.tax_paise,
      total_paise: t.total_paise + r.total_paise,
      paid_paise: t.paid_paise + r.paid_paise,
      refunded_paise: t.refunded_paise + r.refunded_paise,
      revenue_paise: t.revenue_paise + r.revenue_paise,
    }),
    {
      created: 0,
      bookings: 0,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: 0,
      paid_paise: 0,
      refunded_paise: 0,
      revenue_paise: 0,
    },
  );
}

/** Sales rows per day (all services) for the trend chart, with empty days in [from, to] filled in. */
export function salesByDay(
  rows: readonly SalesRow[],
  from: string,
  to: string,
): { day: string; bookings: number; revenue_paise: number }[] {
  const days = new Map(dateRange(from, to).map((day) => [day, { day, bookings: 0, revenue_paise: 0 }]));
  for (const r of rows) {
    const d = days.get(r.day);
    if (!d) continue;
    d.bookings += r.bookings;
    d.revenue_paise += r.revenue_paise;
  }
  return [...days.values()];
}

/** Cancellations per service, most first. */
export function cancellationsByService(
  rows: readonly CancellationRow[],
): { service: string; count: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.service, (by.get(r.service) ?? 0) + r.cancellations);
  return [...by.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service));
}

// ---------------------------------------------------------------- CSV

const rupees = (paise: number) => (paise / 100).toFixed(2);
const percent = (bps: number) => (bps / 100).toFixed(2);

type CsvSpec<T> = { header: readonly string[]; row: (r: T) => CsvValue[] };

const CSV: { [K in ReportKey]: CsvSpec<ReportRows[K][number]> } = {
  sales: {
    header: [
      "date",
      "service",
      "created",
      "bookings",
      "subtotal_inr",
      "discount_inr",
      "tax_inr",
      "total_inr",
      "paid_inr",
      "refunded_inr",
      "revenue_inr",
    ],
    row: (r) => [
      r.day,
      r.service,
      r.created,
      r.bookings,
      rupees(r.subtotal_paise),
      rupees(r.discount_paise),
      rupees(r.tax_paise),
      rupees(r.total_paise),
      rupees(r.paid_paise),
      rupees(r.refunded_paise),
      rupees(r.revenue_paise),
    ],
  },
  occupancy: {
    header: [
      "hotel",
      "rooms",
      "room_nights_available",
      "room_nights_sold",
      "occupancy_percent",
      "room_revenue_inr",
      "adr_inr",
    ],
    row: (r) => [
      pickLocalized(r.hotel_name as LocalizedJson, "en"),
      r.rooms,
      r.available_nights,
      r.sold_nights,
      percent(r.occupancy_bps),
      rupees(r.room_revenue_paise),
      rupees(r.adr_paise),
    ],
  },
  vendors: {
    header: [
      "vendor",
      "kind",
      "bookings",
      "cancelled",
      "booked_value_inr",
      "commission_inr",
      "net_payable_inr",
      "rating",
      "reviews",
    ],
    row: (r) => [
      r.vendor_name,
      r.vendor_kind,
      r.bookings,
      r.cancelled,
      rupees(r.gmv_paise),
      rupees(r.commission_paise),
      rupees(r.net_paise),
      r.rating_avg ?? "",
      r.rating_count,
    ],
  },
  agents: {
    header: [
      "agent",
      "email",
      "leads",
      "contacted",
      "quoted",
      "won",
      "lost",
      "open",
      "win_rate_percent",
      "won_value_inr",
      "calls",
    ],
    row: (r) => [
      r.agent_id ? (r.agent_name ?? r.agent_email ?? r.agent_id) : "Unassigned",
      r.agent_email ?? "",
      r.leads,
      r.contacted,
      r.quoted,
      r.won,
      r.lost,
      r.open,
      percent(r.win_rate_bps),
      rupees(r.won_value_paise),
      r.calls,
    ],
  },
  coupons: {
    header: ["code", "kind", "redemptions", "released", "customers", "discount_inr", "booked_value_inr"],
    row: (r) => [
      r.code,
      r.kind,
      r.redemptions,
      r.released,
      r.customers,
      rupees(r.discount_paise),
      rupees(r.gmv_paise),
    ],
  },
  cancellations: {
    header: ["service", "cancelled_by", "reason", "cancellations", "total_inr", "paid_inr", "refunded_inr"],
    row: (r) => [
      r.service,
      r.cancelled_by,
      r.reason,
      r.cancellations,
      rupees(r.total_paise),
      rupees(r.paid_paise),
      rupees(r.refunded_paise),
    ],
  },
};

export function reportCsv<K extends ReportKey>(report: K, rows: readonly ReportRows[K][number][]): string {
  const spec = CSV[report] as CsvSpec<ReportRows[K][number]>;
  return toCsv(spec.header, rows.map(spec.row));
}

export function reportFilename(report: ReportKey, from: string, to: string): string {
  return `${report}-report-${from}-to-${to}.csv`;
}
