/**
 * Acceptance criteria that live in the database (master prompt §15):
 *   - double booking is impossible under concurrent requests,
 *   - webhook replays and out-of-order events never duplicate payments or bookings,
 *   - RLS keeps customers and vendors out of each other's data.
 *
 * PGlite is a single connection, so true parallel transactions cannot run
 * here. The race tests do the next best thing: the first request's hold is
 * made inside a still-open transaction, the second request runs in the same
 * uncommitted state (a savepoint), and we assert both the outcome and the
 * lock / constraint that makes the outcome hold on real, multi-connection
 * Postgres. Each test's comment names the SQL that provides the guarantee.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let custA: string;
let custB: string;
let vendA: string;
let vendB: string;
let vendorA: string;
let vendorB: string;
let homestay: { hotel: string; room: string; plan: string }; // 2 units
let inn: { hotel: string; room: string; plan: string };
let restaurant: string; // vendor A's store
let mart: string; // vendor B's store
let vrindavan: string;
let peda: string;
let yatra: string;
let departure: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);
const nextCode = (prefix: string) => `${prefix}${String(++codeSeq).padStart(4, "0")}`;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

async function roomOf(slug: string) {
  return one<{ hotel: string; room: string; plan: string }>(
    `select h.id as hotel, r.id as room, p.id as plan
       from public.hotels h join public.hotel_rooms r on r.hotel_id = h.id join public.hotel_rate_plans p on p.room_id = r.id
      where h.slug = $1 order by r.sort_order, p.sort_order limit 1`,
    [slug],
  );
}

// ---------------------------------------------------------------- booking payloads (as the server sends them)

function hotelArgs(
  user: string,
  target: { hotel: string; room: string },
  checkIn: string,
  checkOut: string,
  rooms = 1,
) {
  const amount = 200_000;
  const tax = 10_000;
  return [
    JSON.stringify({
      code: nextCode("PSTACC"),
      user_id: user,
      hotel_id: target.hotel,
      room_id: target.room,
      check_in: checkIn,
      check_out: checkOut,
      rooms,
      adults: rooms,
      children: 0,
      contact_name: "Guest",
      contact_email: "guest@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: 0,
      tax_paise: tax,
      total_paise: amount + tax,
      payable_now_paise: amount + tax,
      payment_mode: "full",
      price_breakdown: { lines: [] },
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    JSON.stringify([
      {
        kind: "room",
        line_key: "room:1",
        description: "Room",
        amount_paise: amount,
        discount_paise: 0,
        tax_rate_bps: 500,
        tax_paise: tax,
      },
    ]),
    JSON.stringify([{ full_name: "Guest", is_primary: true }]),
  ];
}

async function bookHotel(tx: Transaction, ...args: Parameters<typeof hotelArgs>) {
  const { rows } = await tx.query<{ r: { id: string; status: string } }>(
    "select public.create_hotel_booking($1, $2, $3) as r",
    hotelArgs(...args),
  );
  return rows[0].r;
}

function orderArgs(user: string, store: string, item: string, qty: number, price: number) {
  const amount = qty * price;
  return [
    JSON.stringify({
      code: nextCode("PSTORD"),
      user_id: user,
      contact_name: "Food Lover",
      contact_email: "food@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: amount,
      payable_now_paise: amount,
      payment_mode: "pay_at_hotel",
      price_breakdown: { lines: [] },
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    JSON.stringify([
      {
        kind: "item",
        line_key: "item:0",
        description: "Item",
        quantity: qty,
        amount_paise: amount,
        discount_paise: 0,
        tax_rate_bps: 0,
        tax_paise: 0,
        sac: "996331",
      },
    ]),
    JSON.stringify({
      store_id: store,
      zone_id: vrindavan,
      address: { contact_name: "Food Lover", phone: "+919876543210", line1: "Room 12, Radha Kunj" },
    }),
    JSON.stringify([
      {
        item_id: item,
        variant_id: null,
        name: "Item",
        addons: [],
        quantity: qty,
        unit_price_paise: price,
        line_total_paise: amount,
      },
    ]),
  ];
}

async function placeOrder(tx: Transaction, ...args: Parameters<typeof orderArgs>) {
  const { rows } = await tx.query<{ r: { id: string; order_id: string; status: string } }>(
    "select public.create_order($1, $2, $3, $4) as r",
    orderArgs(...args),
  );
  return rows[0].r;
}

async function bookSeats(tx: Transaction, user: string, adults: number) {
  // Read through `tx`: PGlite has one connection, so `db` would wait for this transaction.
  const start = (
    await tx.query<{ d: string }>(
      "select start_date::text as d from public.package_departures where id = $1",
      [departure],
    )
  ).rows[0].d;
  const amount = 1_850_000 * adults;
  const { rows } = await tx.query<{ r: { id: string } }>(
    "select public.create_package_booking($1, $2, $3) as r",
    [
      JSON.stringify({
        code: nextCode("PSTPKG"),
        user_id: user,
        check_in: start,
        check_out: start,
        adults,
        children: 0,
        contact_name: "Yatri",
        contact_email: "yatri@example.com",
        contact_phone: "+919876543210",
        subtotal_paise: amount,
        discount_paise: 0,
        tax_paise: 0,
        total_paise: amount,
        payable_now_paise: amount,
        payment_mode: "full",
        price_breakdown: { lines: [] },
        expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      }),
      JSON.stringify([
        {
          kind: "package",
          line_key: "package:adult",
          description: "Adults",
          quantity: adults,
          amount_paise: amount,
          discount_paise: 0,
          tax_rate_bps: 0,
          tax_paise: 0,
          sac: "998555",
        },
      ]),
      JSON.stringify({
        package_id: yatra,
        departure_id: departure,
        start_date: start,
        end_date: start,
        adults,
        children: 0,
        travellers: [],
      }),
    ],
  );
  return rows[0].r;
}

/** Runs `fn` in a savepoint and returns its error message, rolling the savepoint back either way. */
async function inSavepoint(tx: Transaction, fn: () => Promise<unknown>): Promise<string | null> {
  await tx.exec("savepoint racer");
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await tx.exec("rollback to savepoint racer");
  }
}

/** Table-level lock modes this transaction holds on `table` (FOR UPDATE row locks show as RowShareLock). */
async function locksOn(tx: Transaction, table: string): Promise<string[]> {
  const { rows } = await tx.query<{ mode: string }>(
    "select distinct mode from pg_locks where relation = $1::regclass and pid = pg_backend_pid() order by mode",
    [`public.${table}`],
  );
  return rows.map((r) => r.mode);
}

async function functionSource(name: string): Promise<string> {
  return (
    await one<{ src: string }>("select pg_get_functiondef($1::regproc) as src", [name])
  ).src.toLowerCase();
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  custA = await createUser(db, "cust-a@example.com");
  custB = await createUser(db, "cust-b@example.com");
  vendA = await createUser(db, "vend-a@example.com");
  vendB = await createUser(db, "vend-b@example.com");
  homestay = await roomOf("demo-braj-homestay");
  inn = await roomOf("demo-janmabhoomi-inn");
  restaurant = (
    await one<{ id: string }>("select id from public.stores where slug = 'demo-brajwasi-bhojnalaya'")
  ).id;
  mart = (await one<{ id: string }>("select id from public.stores where slug = 'demo-vrinda-mart'")).id;
  vrindavan = (await one<{ id: string }>("select id from public.delivery_zones where slug = 'vrindavan'")).id;
  peda = (
    await one<{ id: string }>(
      "select id from public.store_items where store_id = $1 and name->>'en' like 'Mathura peda%'",
      [restaurant],
    )
  ).id;
  yatra = (await one<{ id: string }>("select id from public.packages where slug = 'demo-braj-84-kos-yatra'"))
    .id;
  departure = (
    await one<{ id: string }>(
      "select id from public.package_departures where package_id = $1 order by start_date limit 1",
      [yatra],
    )
  ).id;

  // Two vendors: A runs the restaurant and the inn, B runs the mart and the homestay.
  vendorA = (
    await one<{ vendor_id: string }>("select vendor_id from public.stores where id = $1", [restaurant])
  ).vendor_id;
  vendorB = (await one<{ vendor_id: string }>("select vendor_id from public.stores where id = $1", [mart]))
    .vendor_id;
  expect(vendorA).not.toBe(vendorB);
  await db.query("update public.hotels set vendor_id = $1 where id = $2", [vendorA, inn.hotel]);
  await db.query("update public.hotels set vendor_id = $1 where id = $2", [vendorB, homestay.hotel]);
  await db.query("insert into public.vendor_members (vendor_id, user_id) values ($1, $2), ($3, $4)", [
    vendorA,
    vendA,
    vendorB,
    vendB,
  ]);
}, 60_000);

// ================================================================ double booking

describe("double booking under concurrent requests", () => {
  /*
   * Real Postgres: reserve_hotel_inventory() takes `SELECT … FOR UPDATE` on
   * every hotel_inventory row of the stay, in date order, before it counts
   * free units and inserts the hold (supabase/migrations/20261004000100_bookings_payments.sql,
   * "reserve_hotel_inventory"). A second checkout for the same night blocks on
   * that row lock until the first commits, then re-reads held_units and gets
   * `sold_out`. Date ordering means two multi-night stays queue instead of deadlocking.
   */
  it("hotel: two holds racing for the last room — one wins, the other gets sold_out", async () => {
    // One of the homestay's two rooms is already taken for these nights.
    await service((tx) => bookHotel(tx, custA, homestay, "2027-04-01", "2027-04-03"));

    await service(async (tx) => {
      const first = await bookHotel(tx, custA, homestay, "2027-04-01", "2027-04-03");
      expect(first.status).toBe("pending_payment");
      // The first request is still uncommitted and holds row locks on the nights it reserved.
      expect(await locksOn(tx, "hotel_inventory")).toContain("RowShareLock");
      // The second request, overlapping one night, finds no room left.
      const err = await inSavepoint(tx, () => bookHotel(tx, custB, homestay, "2027-04-02", "2027-04-04"));
      expect(err).toMatch(/sold_out/);
      const { rows } = await tx.query<{ sold: number; held: number }>(
        "select sum(sold_units)::int as sold, sum(held_units)::int as held from public.hotel_inventory where room_id = $1 and date = '2027-04-02'",
        [homestay.room],
      );
      expect(rows[0]).toEqual({ sold: 0, held: 2 });
    });
    expect(await functionSource("public.reserve_hotel_inventory")).toMatch(/order by date\s+for update/);
  });

  it("hotel: a request that rolls back leaves no hold behind, so the next one gets the room", async () => {
    await service((tx) => bookHotel(tx, custA, homestay, "2027-05-01", "2027-05-02"));
    await expect(
      service(async (tx) => {
        await bookHotel(tx, custA, homestay, "2027-05-01", "2027-05-02");
        throw new Error("payment provider down");
      }),
    ).rejects.toThrow(/provider down/);
    const winner = await service((tx) => bookHotel(tx, custB, homestay, "2027-05-01", "2027-05-02"));
    expect(winner.status).toBe("pending_payment");
    await expect(service((tx) => bookHotel(tx, custA, homestay, "2027-05-01", "2027-05-02"))).rejects.toThrow(
      /sold_out/,
    );
  });

  /*
   * Real Postgres: create_order() takes stock with one conditional statement,
   * `UPDATE store_items SET stock = stock - qty WHERE id = … AND stock >= qty`
   * (supabase/migrations/20261007000100_delivery.sql, "create_order"). The
   * UPDATE row-locks the item; a concurrent order waits, then re-checks the
   * WHERE clause against the committed row (READ COMMITTED re-evaluation),
   * updates nothing and raises `out_of_stock`. `CHECK (stock >= 0)` backs it up.
   */
  it("delivery: two orders racing for the last tracked unit — one wins, the other gets out_of_stock", async () => {
    await db.query("update public.store_items set track_stock = true, stock = 1 where id = $1", [peda]);
    await service(async (tx) => {
      const first = await placeOrder(tx, custA, restaurant, peda, 1, 12_000);
      expect(first.status).toBe("confirmed");
      expect(await locksOn(tx, "store_items")).toContain("RowExclusiveLock");
      const err = await inSavepoint(tx, () => placeOrder(tx, custB, restaurant, peda, 1, 12_000));
      expect(err).toMatch(/out_of_stock/);
    });
    expect(
      (await one<{ stock: number }>("select stock from public.store_items where id = $1", [peda])).stock,
    ).toBe(0);
    await expect(
      db.query("update public.store_items set stock = stock - 1 where id = $1", [peda]),
    ).rejects.toThrow(/check/i);
    expect(await functionSource("public.create_order")).toMatch(/stock >= \(v_line ->> 'qty'\)::integer/);
  });

  /*
   * Real Postgres: create_package_booking() locks the departure row
   * (`SELECT … FROM package_departures … FOR UPDATE`) before counting seats
   * taken by confirmed and live-hold bookings
   * (supabase/migrations/20261008000100_packages_leads.sql). Concurrent
   * bookings for one departure are serialised on that row.
   */
  it("package: two bookings racing for the last seats — one wins, the other gets sold_out", async () => {
    const taken = (
      await one<{ n: number }>(
        `select coalesce(sum(pb.adults + pb.children), 0)::int as n from public.package_bookings pb
           join public.bookings b on b.id = pb.booking_id
          where pb.departure_id = $1 and (b.status in ('confirmed','completed') or (b.status = 'pending_payment' and b.expires_at > now()))`,
        [departure],
      )
    ).n;
    await db.query("update public.package_departures set seats_total = $1 where id = $2", [
      taken + 2,
      departure,
    ]);
    await service(async (tx) => {
      await bookSeats(tx, custA, 2);
      expect(await locksOn(tx, "package_departures")).toContain("RowShareLock");
      expect(await inSavepoint(tx, () => bookSeats(tx, custB, 1))).toMatch(/sold_out/);
    });
    expect(await functionSource("public.create_package_booking")).toMatch(
      /package_departures[\s\S]*for update/,
    );
  });

  /*
   * Cabs and rides have no fixed inventory (any free car is dispatched later),
   * so "double booking" there means two trips for one booking: `trips.booking_id`
   * and `ride_requests.booking_id` are UNIQUE, and dispatch locks the trip row
   * (`assign_trip`, `assign_ride`: SELECT … FOR UPDATE).
   */
  it("cab and ride: one trip per booking is enforced by unique indexes, dispatch locks the trip", async () => {
    for (const table of ["trips", "ride_requests", "orders", "package_bookings"]) {
      const { rows } = await db.query<{ def: string }>(
        "select indexdef as def from pg_indexes where schemaname = 'public' and tablename = $1 and indexdef ilike '%unique%(booking_id)%'",
        [table],
      );
      expect(rows, table).toHaveLength(1);
    }
    expect(await functionSource("public.assign_trip")).toMatch(
      /from public\.trips where id = p_trip_id for update/,
    );
    expect(await functionSource("public.assign_ride")).toMatch(/for update/);
  });
});

// ================================================================ webhook replays

describe("webhook replays and out-of-order events", () => {
  async function paidBooking(orderId: string) {
    const b = await service((tx) => bookHotel(tx, custA, inn, "2027-06-01", "2027-06-02"));
    await service((tx) => tx.query("select public.attach_payment_order($1, $2, 210000)", [b.id, orderId]));
    return b.id;
  }
  const payment = (orderId: string, status: string, paymentId = `pay_${orderId}`, amount = 210_000) =>
    service(
      async (tx) =>
        (
          await tx.query<{ r: { result: string } }>("select public.record_payment($1) as r", [
            JSON.stringify({
              order_id: orderId,
              payment_id: paymentId,
              status,
              amount_paise: amount,
              error_code: "BAD_REQUEST_ERROR",
            }),
          ])
        ).rows[0].r.result,
    );
  const row = (id: string) =>
    one<{ status: string; paid_paise: number; refunded_paise: number }>(
      "select status::text, paid_paise, refunded_paise from public.bookings where id = $1",
      [id],
    );
  const counts = async (bookingId: string) =>
    one<{ payments: number; invoices: number; refunds: number }>(
      `select (select count(*)::int from public.payments where booking_id = $1) as payments,
              (select count(*)::int from public.invoices where booking_id = $1) as invoices,
              (select count(*)::int from public.refunds where booking_id = $1) as refunds`,
      [bookingId],
    );

  it("ignores payment.failed and payment.authorized arriving after payment.captured", async () => {
    const id = await paidBooking("order_ooo1");
    expect(await payment("order_ooo1", "captured")).toBe("confirmed");
    expect(await payment("order_ooo1", "failed")).toBe("duplicate");
    expect(await payment("order_ooo1", "authorized")).toBe("duplicate");
    expect(await payment("order_ooo1", "captured")).toBe("duplicate");
    expect(await row(id)).toMatchObject({ status: "confirmed", paid_paise: 210_000 });
    expect(
      (
        await one<{ status: string }>(
          "select status::text from public.payments where provider_order_id = 'order_ooo1'",
        )
      ).status,
    ).toBe("captured");
    expect(await counts(id)).toEqual({ payments: 1, invoices: 1, refunds: 0 });
  });

  it("still confirms when a failed attempt is followed by a successful retry on the same order", async () => {
    const id = await paidBooking("order_ooo2");
    expect(await payment("order_ooo2", "failed", "pay_try1")).toBe("recorded");
    expect((await row(id)).status).toBe("pending_payment");
    expect(await payment("order_ooo2", "captured", "pay_try2")).toBe("confirmed");
    expect(await payment("order_ooo2", "failed", "pay_try1")).toBe("duplicate");
    expect(await row(id)).toMatchObject({ status: "confirmed", paid_paise: 210_000 });
  });

  it("records a refund once across refund.created, refund.processed and redeliveries", async () => {
    const id = await paidBooking("order_rf1");
    await payment("order_rf1", "captured");
    await service((tx) => tx.query("select public.cancel_booking($1, $2, 'plans changed')", [id, custA]));
    const paymentId = (
      await one<{ id: string }>("select id from public.payments where provider_order_id = 'order_rf1'")
    ).id;
    const refundEvent = (status: string) =>
      service(
        async (tx) =>
          (
            await tx.query<{ r: { result: string } }>("select public.record_refund($1) as r", [
              JSON.stringify({
                payment_id: paymentId,
                amount_paise: 210_000,
                provider_refund_id: "rfnd_acc_1",
                status,
                reason: "Razorpay refund",
              }),
            ])
          ).rows[0].r.result,
      );
    expect(await refundEvent("pending")).toBe("recorded"); // refund.created
    expect(await refundEvent("pending")).toBe("duplicate"); // redelivery
    expect(await refundEvent("processed")).toBe("duplicate"); // refund.processed updates the same row
    expect(await refundEvent("processed")).toBe("duplicate");
    expect(await row(id)).toMatchObject({ status: "refunded", paid_paise: 210_000, refunded_paise: 210_000 });
    expect(await counts(id)).toEqual({ payments: 1, invoices: 1, refunds: 1 });
    expect(
      (
        await one<{ status: string }>(
          "select status::text from public.refunds where provider_refund_id = 'rfnd_acc_1'",
        )
      ).status,
    ).toBe("processed");
    // A refund webhook never takes back more than was paid, even under a new refund id.
    await expect(
      service((tx) =>
        tx.query("select public.record_refund($1)", [
          JSON.stringify({
            payment_id: paymentId,
            amount_paise: 1,
            provider_refund_id: "rfnd_acc_2",
            status: "processed",
          }),
        ]),
      ),
    ).rejects.toThrow(/refund_exceeds_paid/);
  });

  it("gives the amount back when a counted refund later fails, so staff can retry", async () => {
    const id = await paidBooking("order_rf2");
    await payment("order_rf2", "captured");
    await service((tx) => tx.query("select public.cancel_booking($1, $2, 'plans changed')", [id, custA]));
    const paymentId = (
      await one<{ id: string }>("select id from public.payments where provider_order_id = 'order_rf2'")
    ).id;
    const refundEvent = (refundId: string, status: string) =>
      service((tx) =>
        tx.query("select public.record_refund($1)", [
          JSON.stringify({
            payment_id: paymentId,
            amount_paise: 210_000,
            provider_refund_id: refundId,
            status,
          }),
        ]),
      );
    await refundEvent("rfnd_fail_1", "pending");
    expect(await row(id)).toMatchObject({ status: "refunded", refunded_paise: 210_000 });
    await refundEvent("rfnd_fail_1", "failed"); // refund.failed
    expect(await row(id)).toMatchObject({ status: "cancelled", refunded_paise: 0 });
    await refundEvent("rfnd_fail_1", "processed"); // a late redelivery doesn't revive it
    expect(await row(id)).toMatchObject({ status: "cancelled", refunded_paise: 0 });
    expect(
      (await one<{ status: string }>("select status::text from public.payments where id = $1", [paymentId]))
        .status,
    ).toBe("captured");
    await refundEvent("rfnd_fail_2", "processed"); // the retry
    expect(await row(id)).toMatchObject({ status: "refunded", refunded_paise: 210_000 });
  });

  it("stores each webhook event id once per provider (the route acknowledges redeliveries)", async () => {
    const insert = (provider: string) =>
      service((tx) =>
        tx.query(
          "insert into public.payment_events (provider, event_id, event_type, payload) values ($1, 'evt_acc', 'refund.processed', '{}') on conflict (provider, event_id) do nothing returning id",
          [provider],
        ),
      );
    expect((await insert("razorpay")).rows).toHaveLength(1);
    expect((await insert("razorpay")).rows).toHaveLength(0);
  });
});

// ================================================================ RLS

type Actor = "custA" | "custB" | "vendA" | "vendB" | "anon";
type Owned = { a: string; b: string };

describe("RLS across two customers and two vendors", () => {
  const rows: Record<string, Owned> = {};

  beforeAll(async () => {
    // Bookings: A at vendor A's inn, B at vendor B's homestay.
    const hotelA = await service((tx) => bookHotel(tx, custA, inn, "2027-08-01", "2027-08-02"));
    const hotelB = await service((tx) => bookHotel(tx, custB, homestay, "2027-08-01", "2027-08-02"));
    rows.bookings = { a: hotelA.id, b: hotelB.id };

    // Orders: A from vendor A's restaurant, B from vendor B's mart.
    const martItem = (
      await one<{ id: string }>(
        "select id from public.store_items where store_id = $1 and is_available and (not track_stock or stock > 5) limit 1",
        [mart],
      )
    ).id;
    const thali = (
      await one<{ id: string }>(
        "select id from public.store_items where store_id = $1 and is_available and (not track_stock or stock > 5) limit 1",
        [restaurant],
      )
    ).id;
    const orderA = await service((tx) => placeOrder(tx, custA, restaurant, thali, 1, 20_000));
    const orderB = await service((tx) => placeOrder(tx, custB, mart, martItem, 1, 2_000));
    rows.orders = { a: orderA.order_id, b: orderB.order_id };

    const insert = async (sql: string, params: unknown[]) => (await one<{ id: string }>(sql, params)).id;
    const prescription = (user: string, store: string) =>
      insert(
        `insert into public.prescriptions (user_id, patient_name, phone, zone_id, address, files, store_id)
         values ($1, 'Patient', '+919876543210', $2, '{"line1":"x"}', array[$4], $3) returning id`,
        [user, vrindavan, store, `${user}/rx.jpg`],
      );
    rows.prescriptions = { a: await prescription(custA, restaurant), b: await prescription(custB, mart) };

    const ledger = (vendor: string, booking: string) =>
      insert(
        "insert into public.vendor_ledger_entries (vendor_id, booking_id, kind, adjustment_paise, net_paise, note) values ($1, $2, 'manual', 1000, 1000, 'test') returning id",
        [vendor, booking],
      );
    rows.vendor_ledger_entries = { a: await ledger(vendorA, hotelA.id), b: await ledger(vendorB, hotelB.id) };

    const doc = (vendor: string) =>
      insert(
        `insert into public.vendor_documents (vendor_id, kind, file_path, file_name, mime_type, size_bytes)
         values ($1, 'gst', $2, 'gst.pdf', 'application/pdf', 1000) returning id`,
        [vendor, `${vendor}/gst.pdf`],
      );
    rows.vendor_documents = { a: await doc(vendorA), b: await doc(vendorB) };

    const review = (user: string, booking: string, hotel: string) =>
      insert(
        `insert into public.reviews (booking_id, user_id, subject_type, hotel_id, service, rating, body, author_name, status, moderation_note)
         values ($1, $2, 'hotel', $3, 'hotel', 4, 'Nice stay', 'Guest', 'pending', 'internal note') returning id`,
        [booking, user, hotel],
      );
    rows.reviews = {
      a: await review(custA, hotelA.id, inn.hotel),
      b: await review(custB, hotelB.id, homestay.hotel),
    };

    const privacy = (user: string) =>
      insert("insert into public.privacy_requests (user_id, kind) values ($1, 'export') returning id", [
        user,
      ]);
    rows.privacy_requests = { a: await privacy(custA), b: await privacy(custB) };

    const traveller = (user: string) =>
      insert("insert into public.travellers (user_id, full_name) values ($1, 'Family Member') returning id", [
        user,
      ]);
    rows.travellers = { a: await traveller(custA), b: await traveller(custB) };

    const address = (user: string) =>
      insert(
        "insert into public.addresses (user_id, contact_name, phone, line1, zone_id) values ($1, 'Home', '+919876543210', 'Lane 1', $2) returning id",
        [user, vrindavan],
      );
    rows.addresses = { a: await address(custA), b: await address(custB) };
  }, 60_000);

  const userOf = (actor: Actor) => ({ custA, custB, vendA, vendB })[actor as "custA"];
  async function visible(actor: Actor, table: string): Promise<("a" | "b")[]> {
    const ids = rows[table];
    const run = async (tx: Transaction) =>
      (
        await tx.query<{ id: string }>(`select id from public.${table} where id = any($1::uuid[])`, [
          [ids.a, ids.b],
        ])
      ).rows.map((r) => (r.id === ids.a ? ("a" as const) : ("b" as const)));
    try {
      return (actor === "anon" ? await asAnon(db, run) : await asUser(db, userOf(actor), run)).sort();
    } catch (error) {
      // No grant at all (e.g. anon on private tables) is the strongest form of "not visible".
      if (error instanceof Error && /permission denied/.test(error.message)) return [];
      throw error;
    }
  }

  // Who sees which of the two rows (A's / B's) in each table.
  const own = { custA: ["a"], custB: ["b"], vendA: [], vendB: [], anon: [] };
  const ownAndVendor = { custA: ["a"], custB: ["b"], vendA: ["a"], vendB: ["b"], anon: [] };
  const vendorOnly = { custA: [], custB: [], vendA: ["a"], vendB: ["b"], anon: [] };
  const matrix: [string, Record<Actor, string[]>][] = [
    ["bookings", ownAndVendor],
    ["orders", ownAndVendor],
    ["prescriptions", ownAndVendor],
    ["vendor_ledger_entries", vendorOnly],
    ["vendor_documents", vendorOnly],
    ["reviews", own],
    ["privacy_requests", own],
    ["travellers", own],
    ["addresses", own],
  ];

  it.each(matrix)("%s: each actor sees only their own rows", async (table, expected) => {
    for (const actor of ["custA", "custB", "vendA", "vendB", "anon"] as Actor[]) {
      expect(await visible(actor, table), `${actor} on ${table}`).toEqual(expected[actor]);
    }
  });

  it("hides reviews' private columns from everyone but staff, even on one's own review", async () => {
    for (const col of ["user_id", "booking_id", "moderation_note", "moderated_by"]) {
      await expect(
        asUser(db, custA, (tx) =>
          tx.query(`select ${col} from public.reviews where id = $1`, [rows.reviews.a]),
        ),
        col,
      ).rejects.toThrow(/permission denied/);
      await expect(
        asAnon(db, (tx) => tx.query(`select ${col} from public.reviews`)),
        col,
      ).rejects.toThrow(/permission denied/);
    }
    // Once published, the public sees the public columns only.
    await db.query("update public.reviews set status = 'published' where id = $1", [rows.reviews.b]);
    const pub = await asAnon(db, (tx) =>
      tx.query<{ author_name: string }>(
        "select author_name, rating, body from public.reviews where id = $1",
        [rows.reviews.b],
      ),
    );
    expect(pub.rows).toEqual([{ author_name: "Guest", rating: 4, body: "Nice stay" }]);
    await db.query("update public.reviews set status = 'pending' where id = $1", [rows.reviews.b]);
  });

  it("silently ignores or refuses writes to another user's or vendor's rows", async () => {
    // Own-row tables: an update aimed at someone else's row touches nothing.
    for (const [table, column] of [
      ["travellers", "full_name"],
      ["addresses", "line1"],
    ] as const) {
      const res = await asUser(db, custB, (tx) =>
        tx.query(`update public.${table} set ${column} = 'hijacked' where id = $1`, [rows[table].a]),
      );
      expect(res.affectedRows ?? 0, table).toBe(0);
      const del = await asUser(db, custB, (tx) =>
        tx.query(`delete from public.${table} where id = $1`, [rows[table].a]),
      );
      expect(del.affectedRows ?? 0, table).toBe(0);
    }
    // Server-only tables: no write policy or grant for customers or vendors.
    for (const actor of [custB, vendB, vendA]) {
      for (const [table, id] of [
        ["bookings", rows.bookings.a],
        ["orders", rows.orders.a],
        ["vendor_ledger_entries", rows.vendor_ledger_entries.a],
        ["privacy_requests", rows.privacy_requests.a],
      ] as const) {
        let affected = 0;
        try {
          const res = await asUser(db, actor, (tx) =>
            tx.query(`update public.${table} set updated_at = now() where id = $1`, [id]),
          );
          affected = res.affectedRows ?? 0;
        } catch (error) {
          expect(String(error)).toMatch(/permission denied/);
        }
        expect(affected, `${table} as ${actor}`).toBe(0);
      }
    }
    // Vendor B cannot add a document to vendor A.
    await expect(
      asUser(db, vendB, (tx) =>
        tx.query(
          "insert into public.vendor_documents (vendor_id, kind, file_path, file_name, mime_type, size_bytes) values ($1, 'pan', 'x/pan.pdf', 'pan.pdf', 'application/pdf', 10)",
          [vendorA],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
    // Nothing changed.
    expect(
      (
        await one<{ full_name: string }>("select full_name from public.travellers where id = $1", [
          rows.travellers.a,
        ])
      ).full_name,
    ).toBe("Family Member");
  });

  it("covers every table touched here with RLS enabled", async () => {
    const { rows: off } = await db.query<{ t: string }>(
      "select relname as t from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname = any($1) and not relrowsecurity",
      [matrix.map(([t]) => t)],
    );
    expect(off).toEqual([]);
  });
});
