import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let priya: string;
let ravi: string;
let agent: string;
let manager: string;
let hotel: string;
let room: string;
let vendor: string;
let codeSeq = 0;

const FROM = "2026-09-01";
const TO = "2026-09-30";

type BookingInput = {
  service?: string;
  status: string;
  total: number;
  paid?: number;
  refunded?: number;
  /** created_at as an India wall-clock time, e.g. "2026-09-02 10:00". */
  createdIst: string;
  user?: string | null;
  hotel?: boolean;
  confirmed?: boolean;
  cancelledIst?: string;
  cancelledBy?: string | null;
  reason?: string;
};

async function booking(b: BookingInput): Promise<string> {
  const isHotel = b.hotel === true;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.bookings (code, user_id, service, status, contact_name, contact_phone, subtotal_paise,
       tax_paise, total_paise, payable_now_paise, paid_paise, refunded_paise, payment_mode, price_breakdown,
       hotel_id, vendor_id, check_in, check_out, rooms, adults,
       created_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason)
     values ($1, $2, $3, $4, 'Report Guest', '+919876543210', $5, 0, $5, $5, $6, $7, 'full', '{}',
       $8, $9, $10, $11, $12, $13,
       ($14::timestamp at time zone 'Asia/Kolkata'),
       case when $15 then ($14::timestamp at time zone 'Asia/Kolkata') end,
       case when $16::text is not null then ($16::timestamp at time zone 'Asia/Kolkata') end,
       $17, $18)
     returning id`,
    [
      `PSTRPT${String(++codeSeq).padStart(4, "0")}`,
      b.user === undefined ? priya : b.user,
      isHotel ? "hotel" : (b.service ?? "travel"),
      b.status,
      b.total,
      b.paid ?? 0,
      b.refunded ?? 0,
      isHotel ? hotel : null,
      isHotel ? vendor : null,
      isHotel ? "2026-09-10" : null,
      isHotel ? "2026-09-11" : null,
      isHotel ? 1 : null,
      isHotel ? 2 : null,
      b.createdIst,
      b.confirmed ?? false,
      b.cancelledIst ?? null,
      b.cancelledBy ?? null,
      b.reason ?? null,
    ],
  );
  return rows[0].id;
}

async function call<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return asService(db, async (tx) => (await tx.query<T>(sql, params)).rows);
}

let hotelBooking: string;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  priya = await createUser(db, "priya@example.com");
  ravi = await createUser(db, "ravi@example.com");
  agent = await createUser(db, "agent@example.com");
  manager = await createUser(db, "manager@example.com");
  await db.query("select public.grant_role_by_email('agent@example.com', 'agent')");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  await db.query(
    "update public.profiles set full_name = 'Priya Sharma', phone = '+919876500001' where id = $1",
    [priya],
  );
  await db.query("update public.profiles set full_name = 'Ravi Kumar', is_blocked = true where id = $1", [
    ravi,
  ]);
  await db.query("update public.profiles set full_name = 'Asha Agent' where id = $1", [agent]);

  const v = await db.query<{ id: string }>(
    "insert into public.vendors (kind, name, slug, status) values ('hotel', 'Report Inn Pvt', 'report-inn', 'active') returning id",
  );
  vendor = v.rows[0].id;
  const h = await db.query<{ hotel_id: string; room_id: string }>(
    `select h.id as hotel_id, r.id as room_id from public.hotels h join public.hotel_rooms r on r.hotel_id = h.id
      where h.status = 'published' order by h.slug, r.sort_order limit 1`,
  );
  hotel = h.rows[0].hotel_id;
  room = h.rows[0].room_id;
  await db.query("update public.hotels set vendor_id = $1 where id = $2", [vendor, hotel]);

  // Sold: a hotel stay, a travel booking with a partial refund, and one just after midnight India time.
  hotelBooking = await booking({
    hotel: true,
    status: "confirmed",
    total: 1_000_000,
    paid: 1_000_000,
    createdIst: "2026-09-02 10:00",
    confirmed: true,
  });
  await booking({
    status: "partially_refunded",
    total: 500_000,
    paid: 500_000,
    refunded: 100_000,
    createdIst: "2026-09-02 18:00",
    confirmed: true,
  });
  await booking({
    status: "confirmed",
    total: 100_000,
    paid: 100_000,
    createdIst: "2026-09-01 00:30",
    confirmed: true,
  });
  // Not sold: an expired hold, and a cab trip the customer cancelled and was refunded.
  await booking({ status: "expired", total: 300_000, createdIst: "2026-09-03 12:00" });
  await booking({
    service: "cab",
    status: "refunded",
    total: 200_000,
    paid: 200_000,
    refunded: 200_000,
    createdIst: "2026-09-04 09:00",
    confirmed: true,
    cancelledIst: "2026-09-04 11:00",
    cancelledBy: priya,
    reason: "change of plans",
  });
  // Outside the range: 23:00 India time on 31 August is still August.
  await booking({
    status: "confirmed",
    total: 900_000,
    paid: 900_000,
    createdIst: "2026-08-31 23:00",
    confirmed: true,
  });

  // One room-night sold on 10 September.
  await db.query(
    `insert into public.hotel_inventory (room_id, date, sold_units) values ($1, '2026-09-10', 1)
     on conflict (room_id, date) do update set sold_units = 1`,
    [room],
  );
  await db.query(
    `insert into public.booking_items (booking_id, kind, line_key, description, service_date, room_id, amount_paise,
       tax_rate_bps, tax_paise)
     values ($1, 'room', 'room:1', 'Deluxe', '2026-09-10', $2, 800000, 1200, 96000)`,
    [hotelBooking, room],
  );
}, 60_000);

describe("report functions", () => {
  it("are callable only by the service role", async () => {
    const attempt = asUser(db, manager, (tx) =>
      tx.query("select public.report_dashboard('2026-09-01', '2026-09-30')"),
    );
    await expect(attempt).rejects.toThrow(/permission denied/);
    const customers = asUser(db, manager, (tx) => tx.query("select * from public.admin_customers()"));
    await expect(customers).rejects.toThrow(/permission denied/);
  });

  it("totals the dashboard over India dates", async () => {
    const [{ r }] = await call<{ r: Record<string, unknown> }>(
      "select public.report_dashboard($1, $2) as r",
      [FROM, TO],
    );
    expect(r).toMatchObject({
      bookings: 3,
      created: 5,
      converted: 4,
      conversion_bps: 8000,
      revenue_paise: 1_500_000,
      gmv_paise: 1_500_000,
      aov_paise: 500_000,
      cancelled: 1,
      customers: 1,
    });
    const byService = r.by_service as { service: string; bookings: number; revenue_paise: number }[];
    expect(byService.find((s) => s.service === "hotel")).toMatchObject({
      bookings: 1,
      revenue_paise: 1_000_000,
    });
    expect(byService.find((s) => s.service === "travel")).toMatchObject({
      bookings: 2,
      revenue_paise: 500_000,
    });
    const series = r.series as { day: string; bookings: number; created: number }[];
    expect(series).toHaveLength(30);
    expect(series[0]).toMatchObject({ day: "2026-09-01", bookings: 1, created: 1 });
    expect(series[1]).toMatchObject({ day: "2026-09-02", bookings: 2, created: 2 });
    expect((r.top_hotels as { id: string }[])[0]).toMatchObject({
      id: hotel,
      bookings: 1,
      gmv_paise: 1_000_000,
    });
  });

  it("splits sales per day and service", async () => {
    const rows = await call<{ day: string; service: string; bookings: number; revenue_paise: number }>(
      "select day::text, service::text, bookings::int, revenue_paise::int from public.report_sales($1, $2)",
      [FROM, TO],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { day: "2026-09-01", service: "travel", bookings: 1, revenue_paise: 100_000 },
        { day: "2026-09-02", service: "hotel", bookings: 1, revenue_paise: 1_000_000 },
        { day: "2026-09-02", service: "travel", bookings: 1, revenue_paise: 400_000 },
        { day: "2026-09-03", service: "travel", bookings: 0, revenue_paise: 0 },
      ]),
    );
  });

  it("works out occupancy and ADR over stay dates", async () => {
    const rows = await call<{
      hotel_id: string;
      sold_nights: number;
      available_nights: number;
      adr_paise: number;
    }>(
      `select hotel_id, sold_nights::int, available_nights::int, room_revenue_paise::int, adr_paise::int, occupancy_bps
         from public.report_occupancy('2026-09-10', '2026-09-10')`,
    );
    const row = rows.find((r) => r.hotel_id === hotel);
    expect(row).toMatchObject({ sold_nights: 1, adr_paise: 800_000, room_revenue_paise: 800_000 });
    expect(row!.available_nights).toBeGreaterThanOrEqual(1);
  });

  it("credits the hotel's vendor in vendor performance", async () => {
    const rows = await call<{ vendor_id: string; bookings: number; gmv_paise: number }>(
      "select vendor_id, bookings::int, gmv_paise::int from public.report_vendor_performance($1, $2)",
      [FROM, TO],
    );
    expect(rows.find((r) => r.vendor_id === vendor)).toMatchObject({ bookings: 1, gmv_paise: 1_000_000 });
  });

  it("groups cancellations by service, who and reason", async () => {
    const rows = await call<Record<string, unknown>>(
      `select service::text, cancelled_by, reason, cancellations::int, refunded_paise::int
         from public.report_cancellations($1, $2)`,
      [FROM, TO],
    );
    expect(rows).toEqual([
      {
        service: "cab",
        cancelled_by: "customer",
        reason: "change of plans",
        cancellations: 1,
        refunded_paise: 200_000,
      },
    ]);
  });

  it("counts coupon redemptions and folds reward codes into one row", async () => {
    const c = await db.query<{ id: string }>(
      "insert into public.coupons (code, discount_type, value) values ('DIWALI10', 'percent', 1000) returning id",
    );
    const reward = await db.query<{ id: string }>(
      "insert into public.coupons (code, discount_type, value, user_id) values ('PSRAB12CD', 'flat', 5000, $1) returning id",
      [priya],
    );
    const travel = await booking({
      status: "confirmed",
      total: 200_000,
      paid: 200_000,
      createdIst: "2026-09-05 10:00",
      confirmed: true,
    });
    await db.query(
      `insert into public.coupon_redemptions (coupon_id, booking_id, user_id, discount_paise, status)
       values ($1, $2, $3, 50000, 'redeemed'), ($4, $5, $3, 5000, 'redeemed')`,
      [c.rows[0].id, hotelBooking, priya, reward.rows[0].id, travel],
    );
    const rows = await call<Record<string, unknown>>(
      "select code, kind, redemptions::int, discount_paise::int from public.report_coupon_usage($1, $2)",
      [FROM, TO],
    );
    expect(rows).toEqual([
      { code: "DIWALI10", kind: "coupon", redemptions: 1, discount_paise: 50000 },
      { code: "PSR", kind: "reward", redemptions: 1, discount_paise: 5000 },
    ]);
  });

  it("measures agents on the leads assigned to them", async () => {
    const lead = (status: string, extra = "") =>
      db.query<{ id: string }>(
        `insert into public.leads (kind, name, phone, status, assigned_to, value_paise, created_at ${extra ? ", lost_reason" : ""})
         values ('package', 'Lead Person', '+919800000000', $1, $2, 300000,
                 ('2026-09-06 10:00'::timestamp at time zone 'Asia/Kolkata') ${extra ? ", $3" : ""})
         returning id`,
        extra ? [status, agent, extra] : [status, agent],
      );
    const won = await lead("won");
    await lead("lost", "Budget");
    await lead("new");
    await db.query(
      `insert into public.lead_activities (lead_id, kind, actor, created_at)
       values ($1, 'call', $2, ('2026-09-06 11:00'::timestamp at time zone 'Asia/Kolkata'))`,
      [won.rows[0].id, agent],
    );
    const rows = await call<Record<string, unknown>>(
      `select agent_id, agent_name, leads::int, won::int, lost::int, open::int, won_value_paise::int, calls::int,
              win_rate_bps
         from public.report_agent_performance($1, $2)`,
      [FROM, TO],
    );
    expect(rows.find((r) => r.agent_id === agent)).toEqual({
      agent_id: agent,
      agent_name: "Asha Agent",
      leads: 3,
      won: 1,
      lost: 1,
      open: 1,
      won_value_paise: 300000,
      calls: 1,
      win_rate_bps: 5000,
    });
  });
});

describe("pending actions", () => {
  it("counts work waiting for staff", async () => {
    const [{ r }] = await call<{ r: Record<string, number> }>("select public.report_pending_actions() as r");
    expect(r).toMatchObject({ new_leads: 1, open_refunds: 0, pending_payouts: 0 });
    expect(Object.keys(r).sort()).toEqual(
      [
        "low_stock_food",
        "low_stock_medicine",
        "new_leads",
        "open_refunds",
        "overdue_follow_ups",
        "pending_applications",
        "pending_payouts",
        "pending_reviews",
        "requested_rides",
        "unassigned_trips",
      ].sort(),
    );
  });
});

describe("admin customers", () => {
  it("searches, filters and totals customers", async () => {
    const byName = await call<{ id: string; bookings: number; spend_paise: number; total_count: number }>(
      "select id, bookings::int, spend_paise::int, total_count::int from public.admin_customers('priy')",
    );
    // Booked: 4 in September + 1 in August that ever confirmed; spend = paid − refunded on all of them.
    expect(byName).toEqual([
      {
        id: priya,
        bookings: 6,
        spend_paise: 1_000_000 + 400_000 + 100_000 + 0 + 900_000 + 200_000,
        total_count: 1,
      },
    ]);
    const byPhone = await call<{ id: string }>("select id from public.admin_customers('98765 00001')");
    expect(byPhone.map((r) => r.id)).toEqual([priya]);
    const blocked = await call<{ id: string }>("select id from public.admin_customers(null, true)");
    expect(blocked.map((r) => r.id)).toEqual([ravi]);
    const withBookings = await call<{ id: string }>(
      "select id from public.admin_customers(null, null, true)",
    );
    expect(withBookings.map((r) => r.id)).toEqual([priya]);
    const page = await call<{ total_count: number }>(
      "select total_count::int from public.admin_customers(null, null, null, 2, 0)",
    );
    expect(page).toHaveLength(2);
    expect(page[0].total_count).toBeGreaterThanOrEqual(4);
  });

  it("summarises one customer", async () => {
    const [{ r }] = await call<{ r: Record<string, unknown> }>(
      "select public.admin_customer_summary($1) as r",
      [priya],
    );
    expect(r).toMatchObject({ bookings: 6, cancelled: 1, points: 0 });
  });
});
