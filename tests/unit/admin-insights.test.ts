import { describe, expect, it } from "vitest";
import {
  adjustPointsError,
  customerSearchArgs,
  customersQuery,
  parseCustomerFilters,
} from "@/lib/customers/rows";
import {
  loyaltySettingsFormValues,
  loyaltySettingsValue,
  reviewsSettingsFormValues,
  reviewsSettingsValue,
} from "@/lib/engagement/admin-rows";
import { parseLoyaltySettings } from "@/lib/loyalty/rules";
import { formatBps, formatDayShort } from "@/lib/reports/format";
import { parseReportRange, rangeQuery } from "@/lib/reports/range";
import {
  cancellationsByService,
  parseDashboard,
  reportCsv,
  reportFilename,
  salesByDay,
  sumSales,
  visiblePendingActions,
  type SalesRow,
} from "@/lib/reports/rows";
import {
  adjustPointsSchema,
  loyaltySettingsFormSchema,
  reviewsSettingsFormSchema,
} from "@/schemas/engagement-admin";
import { reviewsSettingsSchema } from "@/schemas/reviews";

const TODAY = "2026-10-03";
const uuid = "6f1c3a52-7d4b-4e8a-9f20-1b2c3d4e5f60";

describe("report date ranges", () => {
  it("defaults to the last 30 days ending today", () => {
    expect(parseReportRange({}, TODAY)).toEqual({ preset: "30", from: "2026-09-04", to: TODAY, days: 30 });
  });

  it("supports the 7 and 90 day presets", () => {
    expect(parseReportRange({ range: "7" }, TODAY)).toMatchObject({ from: "2026-09-27", to: TODAY, days: 7 });
    expect(parseReportRange({ range: "90" }, TODAY)).toMatchObject({ from: "2026-07-06", days: 90 });
  });

  it("orders a custom range, fills a missing end and caps it at a year", () => {
    expect(parseReportRange({ range: "custom", from: "2026-09-30", to: "2026-09-01" }, TODAY)).toEqual({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      days: 30,
    });
    expect(parseReportRange({ from: "2026-09-10" }, TODAY)).toMatchObject({
      preset: "custom",
      from: "2026-09-10",
      to: "2026-09-10",
      days: 1,
    });
    const long = parseReportRange({ range: "custom", from: "2020-01-01", to: "2026-09-30" }, TODAY);
    expect(long).toMatchObject({ from: "2025-09-30", to: "2026-09-30", days: 366 });
  });

  it("ignores junk and falls back to the default", () => {
    expect(parseReportRange({ range: "999", from: "nope", to: ["x"] }, TODAY)).toMatchObject({
      preset: "30",
    });
    expect(parseReportRange({ range: "custom" }, TODAY)).toMatchObject({ preset: "30" });
  });

  it("round-trips through the query string", () => {
    expect(rangeQuery({ preset: "7", from: "a", to: "b" })).toBe("range=7");
    const custom = { preset: "custom" as const, from: "2026-09-01", to: "2026-09-30" };
    const query = Object.fromEntries(new URLSearchParams(rangeQuery(custom)));
    expect(parseReportRange(query, TODAY)).toMatchObject(custom);
  });
});

describe("KPI formatting", () => {
  it("formats basis points as a percentage", () => {
    expect(formatBps(8000)).toBe("80%");
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(0)).toBe("0%");
  });

  it("formats chart days without shifting the date", () => {
    expect(formatDayShort("2026-09-02")).toMatch(/^2 Sep/);
    expect(formatDayShort("bad")).toBe("bad");
  });

  it("parses the dashboard payload defensively", () => {
    const data = parseDashboard({ bookings: 3, revenue_paise: "1500", top_hotels: "junk", series: null });
    expect(data).toMatchObject({ bookings: 3, revenue_paise: 1500, created: 0, top_hotels: [], series: [] });
  });
});

describe("pending actions", () => {
  it("shows only what the viewer may open, with counts", () => {
    const counts = { unassigned_trips: 2, new_leads: "4", overdue_follow_ups: -1, open_refunds: 3 };
    const agent = new Set(["dashboard.read", "cabs.read", "leads.read"]);
    const visible = visiblePendingActions(counts, (p) => agent.has(p));
    expect(visible.map((a) => [a.key, a.count])).toEqual([
      ["unassigned_trips", 2],
      ["new_leads", 4],
      ["overdue_follow_ups", 0],
    ]);
    expect(visiblePendingActions(null, () => true)).toHaveLength(10);
  });
});

const sales = (day: string, service: SalesRow["service"], bookings: number, revenue: number): SalesRow => ({
  day,
  service,
  created: bookings + 1,
  bookings,
  subtotal_paise: revenue,
  discount_paise: 0,
  tax_paise: 0,
  total_paise: revenue,
  paid_paise: revenue,
  refunded_paise: 0,
  revenue_paise: revenue,
});

describe("report rows", () => {
  it("totals sales and fills empty days for the chart", () => {
    const rows = [
      sales("2026-09-01", "hotel", 1, 100_000),
      sales("2026-09-01", "cab", 2, 50_000),
      sales("2026-09-03", "cab", 1, 10_000),
    ];
    expect(sumSales(rows)).toMatchObject({ bookings: 4, created: 7, revenue_paise: 160_000 });
    expect(salesByDay(rows, "2026-09-01", "2026-09-03")).toEqual([
      { day: "2026-09-01", bookings: 3, revenue_paise: 150_000 },
      { day: "2026-09-02", bookings: 0, revenue_paise: 0 },
      { day: "2026-09-03", bookings: 1, revenue_paise: 10_000 },
    ]);
  });

  it("totals cancellations per service", () => {
    const row = { reason: "", total_paise: 0, paid_paise: 0, refunded_paise: 0 };
    expect(
      cancellationsByService([
        { ...row, service: "cab", cancelled_by: "customer", cancellations: 2 },
        { ...row, service: "hotel", cancelled_by: "staff", cancellations: 3 },
        { ...row, service: "cab", cancelled_by: "system", cancellations: 2 },
      ]),
    ).toEqual([
      { service: "cab", count: 4 },
      { service: "hotel", count: 3 },
    ]);
  });
});

describe("report CSV", () => {
  it("writes rupees and neutralises spreadsheet formulas", () => {
    const csv = reportCsv("cancellations", [
      {
        service: "cab",
        cancelled_by: "customer",
        reason: '=HYPERLINK("http://x")',
        cancellations: 1,
        total_paise: 123_456,
        paid_paise: 100_000,
        refunded_paise: 50_050,
      },
    ]);
    const [header, line] = csv.trim().split("\r\n");
    expect(header).toBe("service,cancelled_by,reason,cancellations,total_inr,paid_inr,refunded_inr");
    expect(line).toBe(`cab,customer,"'=HYPERLINK(""http://x"")",1,1234.56,1000.00,500.50`);
  });

  it("names hotels in English and labels unassigned leads", () => {
    const occupancy = reportCsv("occupancy", [
      {
        hotel_id: uuid,
        hotel_name: { en: "Shri Radha Inn", hi: "श्री राधा इन" },
        rooms: 3,
        available_nights: 90,
        sold_nights: 45,
        occupancy_bps: 5000,
        room_revenue_paise: 4_500_000,
        adr_paise: 100_000,
      },
    ]);
    expect(occupancy).toContain("Shri Radha Inn,3,90,45,50.00,45000.00,1000.00");
    const agents = reportCsv("agents", [
      {
        agent_id: null,
        agent_name: null,
        agent_email: null,
        leads: 2,
        contacted: 0,
        quoted: 0,
        won: 0,
        lost: 0,
        open: 2,
        won_value_paise: 0,
        calls: 0,
        win_rate_bps: 0,
      },
    ]);
    expect(agents.split("\r\n")[1]).toBe("Unassigned,,2,0,0,0,0,2,0.00,0.00,0");
  });

  it("builds a dated file name", () => {
    expect(reportFilename("sales", "2026-09-01", "2026-09-30")).toBe(
      "sales-report-2026-09-01-to-2026-09-30.csv",
    );
  });
});

describe("customer helpers", () => {
  it("parses list filters and builds the RPC arguments", () => {
    const filters = parseCustomerFilters({ q: " priya ", blocked: "yes", booked: "maybe", page: "3" });
    expect(filters).toEqual({ q: "priya", blocked: "yes", booked: undefined, page: 3 });
    expect(customerSearchArgs(filters, 25)).toEqual({
      p_search: "priya",
      p_blocked: true,
      p_has_bookings: null,
      p_limit: 25,
      p_offset: 50,
    });
    expect(customersQuery(filters, { page: 1 })).toBe("?q=priya&blocked=yes");
    expect(customersQuery(parseCustomerFilters({}))).toBe("");
  });

  it("recognises adjust_points errors", () => {
    expect(adjustPointsError("insufficient_points")).toBe("insufficient_points");
    expect(adjustPointsError("P0001: reason_required")).toBe("reason_required");
    expect(adjustPointsError("boom")).toBeNull();
  });

  it("validates a points adjustment", () => {
    expect(adjustPointsSchema.parse({ user_id: uuid, points: "-50", note: " Goodwill " })).toEqual({
      user_id: uuid,
      points: -50,
      note: "Goodwill",
    });
    expect(
      adjustPointsSchema.safeParse({ user_id: uuid, points: "0", note: "Goodwill" }).error?.issues[0].message,
    ).toBe("invalidAmount");
    expect(adjustPointsSchema.safeParse({ user_id: uuid, points: "1.5", note: "x y z" }).success).toBe(false);
    expect(
      adjustPointsSchema.safeParse({ user_id: uuid, points: "10", note: "" }).error?.issues[0].message,
    ).toBe("reasonRequired");
  });
});

describe("reviews & rewards settings", () => {
  it("round-trips reviews.defaults through the form", () => {
    const stored = reviewsSettingsSchema.parse({});
    const form = reviewsSettingsFormSchema.parse(reviewsSettingsFormValues(stored));
    expect(reviewsSettingsValue(form)).toEqual(stored);
    expect(
      reviewsSettingsFormSchema.safeParse({ ...reviewsSettingsFormValues(stored), max_photo_mb: "11" })
        .success,
    ).toBe(false);
  });

  it("round-trips loyalty.defaults through the form (rupees and % to paise and bps)", () => {
    const stored = parseLoyaltySettings({
      enabled: true,
      point_value_paise: 50,
      earn_bps: 125,
      earn_services: ["hotel", "bogus"],
      min_redeem_points: 100,
      max_redeem_points: null,
      code_valid_days: 30,
      expiry_days: 365,
      review_points: 25,
      referrals_enabled: true,
      referrer_points: 100,
      referee_points: 50,
    });
    const values = loyaltySettingsFormValues(stored);
    expect(values).toMatchObject({
      point_value_rupees: "0.50",
      earn_percent: "1.25",
      earn_services: ["hotel"],
      max_redeem_points: "",
    });
    const form = loyaltySettingsFormSchema.parse(values);
    expect(loyaltySettingsValue(form)).toEqual({ ...stored, earn_services: ["hotel"] });
  });

  it("rejects a largest redemption below the smallest", () => {
    const values = loyaltySettingsFormValues(parseLoyaltySettings({ min_redeem_points: 100 }));
    const result = loyaltySettingsFormSchema.safeParse({ ...values, max_redeem_points: "50" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["max_redeem_points"], message: "maxBelowMin" });
  });
});
