import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let manager: string;
let driverUser: string;
let sedan: string;
let suv: string;
let vrindavan: string;
let agra: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function idOf(table: string, column: string, value: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.${table} where ${column} = $1`, [
    value,
  ]);
  return rows[0].id;
}

function payload(o: { user: string; amount?: number; category?: string; pickupAt?: string }) {
  const amount = o.amount ?? 300_000;
  const tax = Math.round(amount * 0.05);
  codeSeq += 1;
  const pickupAt = o.pickupAt ?? "2026-12-10T04:30:00Z";
  return {
    booking: {
      code: `PSTCAB${String(codeSeq).padStart(3, "0")}`,
      user_id: o.user,
      check_in: pickupAt.slice(0, 10),
      adults: 3,
      contact_name: "Cab Rider",
      contact_email: "rider@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: 0,
      tax_paise: tax,
      total_paise: amount + tax,
      payable_now_paise: amount + tax,
      payment_mode: "full",
      price_breakdown: { lines: [] },
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    items: [
      {
        kind: "fare",
        line_key: "fare",
        description: "Sedan · Vrindavan → Agra",
        amount_paise: amount,
        discount_paise: 0,
        tax_rate_bps: 500,
        tax_paise: tax,
        sac: "996601",
      },
    ],
    trip: {
      trip_type: "one_way",
      category_id: o.category ?? sedan,
      pickup_place_id: vrindavan,
      drop_place_id: agra,
      pickup_address: "ISKCON gate, Vrindavan",
      pickup_at: pickupAt,
      passengers: 3,
      distance_km: 75,
    },
  };
}

async function book(o: Parameters<typeof payload>[0]) {
  const p = payload(o);
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string; status: string } }>(
      "select public.create_cab_booking($1, $2, $3) as r",
      [JSON.stringify(p.booking), JSON.stringify(p.items), JSON.stringify(p.trip)],
    );
    return rows[0].r;
  });
}

async function payFor(bookingId: string, total: number) {
  const order = `order_${bookingId.slice(0, 8)}`;
  await service((tx) =>
    tx.query("select public.attach_payment_order($1, $2, $3)", [bookingId, order, total]),
  );
  await service((tx) =>
    tx.query("select public.record_payment($1)", [
      JSON.stringify({
        order_id: order,
        payment_id: `pay_${order}`,
        status: "captured",
        amount_paise: total,
      }),
    ]),
  );
}

async function tripOf(bookingId: string) {
  const { rows } = await db.query<{
    id: string;
    status: string;
    pickup_otp: string;
    driver_token: string | null;
    driver_name: string | null;
  }>(
    "select id, status::text, pickup_otp, driver_token, driver_name from public.trips where booking_id = $1",
    [bookingId],
  );
  return rows[0];
}

let driverId: string;
let vehicleId: string;
let suvVehicleId: string;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  manager = await createUser(db, "manager@example.com");
  driverUser = await createUser(db, "driver@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  sedan = await idOf("cab_categories", "key", "sedan");
  suv = await idOf("cab_categories", "key", "suv");
  vrindavan = await idOf("cab_places", "slug", "vrindavan");
  agra = await idOf("cab_places", "slug", "agra");
  driverId = (
    await db.query<{ id: string }>(
      "insert into public.drivers (full_name, phone, user_id) values ('Ramesh Kumar', '+919811111111', $1) returning id",
      [driverUser],
    )
  ).rows[0].id;
  vehicleId = (
    await db.query<{ id: string }>(
      "insert into public.vehicles (category_id, registration_no, fuel) values ($1, 'UP85 AB 1234', 'cng') returning id",
      [sedan],
    )
  ).rows[0].id;
  suvVehicleId = (
    await db.query<{ id: string }>(
      "insert into public.vehicles (category_id, registration_no, fuel) values ($1, 'UP85 CD 5678', 'diesel') returning id",
      [suv],
    )
  ).rows[0].id;
}, 60_000);

describe("cab catalog", () => {
  it("is readable by anyone and seeded with places, categories, routes and fares", async () => {
    const counts = await asAnon(db, async (tx) => {
      const q = async (sql: string) => (await tx.query<{ n: number }>(sql)).rows[0].n;
      return {
        places: await q("select count(*)::int as n from public.cab_places"),
        categories: await q("select count(*)::int as n from public.cab_categories"),
        routes: await q("select count(*)::int as n from public.cab_routes"),
        routeFares: await q("select count(*)::int as n from public.cab_route_fares"),
        localFares: await q("select count(*)::int as n from public.cab_local_fares"),
      };
    });
    expect(counts.places).toBeGreaterThanOrEqual(10);
    expect(counts.categories).toBe(5);
    expect(counts.routes).toBeGreaterThanOrEqual(10);
    expect(counts.routeFares).toBeGreaterThan(0);
    expect(counts.localFares).toBe(15);
  });

  it("hides fleet data from customers and lets cab staff manage it", async () => {
    const seen = await asUser(db, alice, async (tx) => ({
      drivers: (await tx.query("select id from public.drivers")).rows.length,
      vehicles: (await tx.query("select id from public.vehicles")).rows.length,
    }));
    expect(seen).toEqual({ drivers: 0, vehicles: 0 });
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          "insert into public.cab_places (slug, name, kind, lat, lng) values ('x', '{\"en\":\"X\"}', 'city', 27, 77)",
        ),
      ),
    ).rejects.toThrow();
    const staff = await asUser(
      db,
      manager,
      async (tx) => (await tx.query("select id from public.drivers")).rows.length,
    );
    expect(staff).toBe(1);
  });

  it("lets a driver with a login read only their own record", async () => {
    const rows = await asUser(
      db,
      driverUser,
      async (tx) => (await tx.query("select id from public.drivers")).rows,
    );
    expect(rows).toEqual([{ id: driverId }]);
  });
});

describe("cab bookings", () => {
  it("creates a booking with an awaiting-payment trip and a pickup OTP", async () => {
    const b = await book({ user: alice });
    expect(b.status).toBe("pending_payment");
    const trip = await tripOf(b.id);
    expect(trip.status).toBe("awaiting_payment");
    expect(trip.pickup_otp).toMatch(/^\d{4}$/);
  });

  it("rejects lines that do not add up and pay-at-hotel mode", async () => {
    const p = payload({ user: alice });
    p.items[0].tax_paise += 1;
    await expect(
      service((tx) =>
        tx.query("select public.create_cab_booking($1, $2, $3)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.trip),
        ]),
      ),
    ).rejects.toThrow(/totals_mismatch/);
    const q = payload({ user: alice });
    await expect(
      service((tx) =>
        tx.query("select public.create_cab_booking($1, $2, $3)", [
          JSON.stringify({ ...q.booking, payment_mode: "pay_at_hotel", payable_now_paise: 0 }),
          JSON.stringify(q.items),
          JSON.stringify(q.trip),
        ]),
      ),
    ).rejects.toThrow(/payment_mode/);
  });

  it("cannot be called by customers directly", async () => {
    const p = payload({ user: alice });
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.create_cab_booking($1, $2, $3)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.trip),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("puts a paid trip on the dispatch board and cancels it with its booking", async () => {
    const b = await book({ user: alice });
    await payFor(b.id, 315_000);
    expect((await tripOf(b.id)).status).toBe("unassigned");
    await service((tx) => tx.query("select public.cancel_booking($1, $2, 'plans changed')", [b.id, alice]));
    expect((await tripOf(b.id)).status).toBe("cancelled");
    const { rows } = await db.query<{ status: string }>(
      "select e.status::text from public.trip_events e join public.trips t on t.id = e.trip_id where t.booking_id = $1 order by e.created_at",
      [b.id],
    );
    expect(rows.map((r) => r.status)).toEqual(["unassigned", "cancelled"]);
  });

  it("cancels the trip when an unpaid booking expires", async () => {
    const b = await book({ user: bob });
    await db.query("update public.bookings set expires_at = now() - interval '1 minute' where id = $1", [
      b.id,
    ]);
    await service((tx) => tx.query("select public.expire_stale_bookings()"));
    expect((await tripOf(b.id)).status).toBe("cancelled");
  });
});

describe("dispatch", () => {
  it("assigns a driver (with an upgrade), checks the OTP at pickup and completes the booking", async () => {
    const b = await book({ user: alice });
    await payFor(b.id, 315_000);
    const trip = await tripOf(b.id);

    await expect(
      service((tx) =>
        tx.query("select public.assign_trip($1, $2, $3, $4)", [trip.id, driverId, suvVehicleId, manager]),
      ),
    ).resolves.toBeTruthy();
    const assigned = await tripOf(b.id);
    expect(assigned.status).toBe("assigned");
    expect(assigned.driver_name).toBe("Ramesh Kumar");
    expect(assigned.driver_token).toMatch(/^[0-9a-f]{48}$/);

    // Reassigning issues a fresh link so the old one stops working.
    await service((tx) =>
      tx.query("select public.assign_trip($1, $2, $3, $4)", [trip.id, driverId, vehicleId, manager]),
    );
    expect((await tripOf(b.id)).driver_token).not.toBe(assigned.driver_token);

    const move = (status: string, otp?: string) =>
      service((tx) =>
        tx.query("select public.set_trip_status($1, $2, null, 'driver', null, $3)", [
          trip.id,
          status,
          otp ?? null,
        ]),
      );
    await move("en_route");
    await expect(move("completed")).rejects.toThrow(/invalid_transition/);
    await expect(move("picked_up", "0000" === trip.pickup_otp ? "1111" : "0000")).rejects.toThrow(
      /otp_mismatch/,
    );
    await move("picked_up", trip.pickup_otp);
    await move("completed");
    expect((await tripOf(b.id)).status).toBe("completed");
    const { rows } = await db.query<{ status: string }>(
      "select status::text from public.bookings where id = $1",
      [b.id],
    );
    expect(rows[0].status).toBe("completed");
  });

  it("refuses inactive drivers and unpaid trips", async () => {
    const b = await book({ user: alice });
    const trip = await tripOf(b.id);
    await expect(
      service((tx) =>
        tx.query("select public.assign_trip($1, $2, $3, $4)", [trip.id, driverId, vehicleId, manager]),
      ),
    ).rejects.toThrow(/invalid_transition/);
    await payFor(b.id, 315_000);
    await db.query("update public.drivers set is_active = false where id = $1", [driverId]);
    await expect(
      service((tx) =>
        tx.query("select public.assign_trip($1, $2, $3, $4)", [trip.id, driverId, vehicleId, manager]),
      ),
    ).rejects.toThrow(/driver_unavailable/);
    await db.query("update public.drivers set is_active = true where id = $1", [driverId]);
  });

  it("shows the customer their trip and driver but never the driver link token", async () => {
    const b = await book({ user: alice });
    await payFor(b.id, 315_000);
    const trip = await tripOf(b.id);
    await service((tx) =>
      tx.query("select public.assign_trip($1, $2, $3, $4)", [trip.id, driverId, vehicleId, manager]),
    );

    const mine = await asUser(
      db,
      alice,
      async (tx) =>
        (
          await tx.query<{ driver_name: string }>("select driver_name from public.trips where id = $1", [
            trip.id,
          ])
        ).rows,
    );
    expect(mine).toEqual([{ driver_name: "Ramesh Kumar" }]);
    await expect(
      asUser(db, alice, (tx) => tx.query("select driver_token from public.trips where id = $1", [trip.id])),
    ).rejects.toThrow(/permission denied/);
    const others = await asUser(
      db,
      bob,
      async (tx) => (await tx.query("select id from public.trips where id = $1", [trip.id])).rows,
    );
    expect(others).toHaveLength(0);
    const asDriver = await asUser(
      db,
      driverUser,
      async (tx) => (await tx.query("select id from public.trips where id = $1", [trip.id])).rows,
    );
    expect(asDriver).toHaveLength(1);
  });

  it("audits who assigned the trip", async () => {
    const { rows } = await db.query<{ actor_id: string }>(
      "select actor_id from public.audit_logs where table_name = 'trips' and new_data->>'driver_id' is not null order by id desc limit 1",
    );
    expect(rows[0]?.actor_id).toBe(manager);
  });
});
