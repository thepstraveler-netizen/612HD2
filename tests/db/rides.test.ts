import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let manager: string;
let driverUser: string;
let bike: string;
let car: string;
let vrindavan: string;
let iskcon: string;
let bihari: string;
let driverId: string;
let bikeVehicleId: string;
let cabVehicleId: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function idOf(table: string, column: string, value: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.${table} where ${column} = $1`, [
    value,
  ]);
  return rows[0].id;
}

type Opts = {
  user: string;
  amount?: number;
  mode?: "full" | "pay_at_hotel";
  type?: string;
  hourly?: boolean;
};

function payload(o: Opts) {
  const amount = o.amount ?? 6_000;
  codeSeq += 1;
  const pickupAt = "2026-12-10T04:30:00Z";
  return {
    booking: {
      code: `PSTRID${String(codeSeq).padStart(3, "0")}`,
      user_id: o.user,
      check_in: pickupAt.slice(0, 10),
      adults: 1,
      contact_name: "Ride Rider",
      contact_email: "rider@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: amount,
      payable_now_paise: amount,
      payment_mode: o.mode ?? "pay_at_hotel",
      price_breakdown: { lines: [] },
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
    items: [
      {
        kind: "fare",
        line_key: "fare",
        description: "Bike · ISKCON → Banke Bihari",
        amount_paise: amount,
        discount_paise: 0,
        tax_rate_bps: 0,
        tax_paise: 0,
        sac: "996601",
      },
    ],
    ride: {
      vehicle_type_id: o.type ?? bike,
      zone_id: vrindavan,
      mode: o.hourly ? "hourly" : "point_to_point",
      pickup_point_id: iskcon,
      pickup_lat: 27.5724,
      pickup_lng: 77.6738,
      pickup_address: "ISKCON main gate",
      drop_point_id: o.hourly ? null : bihari,
      drop_lat: o.hourly ? null : 27.5806,
      drop_lng: o.hourly ? null : 77.7006,
      drop_address: null,
      hours: o.hourly ? 2 : null,
      pickup_at: pickupAt,
      passengers: 1,
      distance_km: o.hourly ? null : 3.4,
    },
  };
}

async function book(o: Opts) {
  const p = payload(o);
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string; status: string } }>(
      "select public.create_ride_booking($1, $2, $3) as r",
      [JSON.stringify(p.booking), JSON.stringify(p.items), JSON.stringify(p.ride)],
    );
    return rows[0].r;
  });
}

async function rideOf(bookingId: string) {
  const { rows } = await db.query<{
    id: string;
    status: string;
    pickup_otp: string;
    driver_token: string | null;
    driver_name: string | null;
  }>(
    "select id, status::text, pickup_otp, driver_token, driver_name from public.ride_requests where booking_id = $1",
    [bookingId],
  );
  return rows[0];
}

async function bookingStatus(id: string) {
  const { rows } = await db.query<{ status: string; payable_now_paise: number; expires_at: string | null }>(
    "select status::text, payable_now_paise, expires_at from public.bookings where id = $1",
    [id],
  );
  return rows[0];
}

const assign = (rideId: string, vehicle: string | null = null) =>
  service((tx) =>
    tx.query("select public.assign_ride($1, $2, $3, $4)", [rideId, driverId, vehicle, manager]),
  );

const step = (rideId: string, status: string, otp: string | null = null, source = "driver") =>
  service((tx) =>
    tx.query("select public.set_ride_status($1, $2::public.ride_status, $3, $4, null, $5)", [
      rideId,
      status,
      null,
      source,
      otp,
    ]),
  );

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  manager = await createUser(db, "manager@example.com");
  driverUser = await createUser(db, "driver@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  bike = await idOf("ride_vehicle_types", "key", "bike");
  car = await idOf("ride_vehicle_types", "key", "car");
  vrindavan = await idOf("ride_zones", "slug", "vrindavan");
  iskcon = await idOf("ride_points", "slug", "iskcon-vrindavan");
  bihari = await idOf("ride_points", "slug", "banke-bihari");
  driverId = (
    await db.query<{ id: string }>(
      "insert into public.drivers (full_name, phone, user_id) values ('Mohan Lal', '+919822222222', $1) returning id",
      [driverUser],
    )
  ).rows[0].id;
  bikeVehicleId = (
    await db.query<{ id: string }>(
      "insert into public.vehicles (ride_vehicle_type_id, registration_no, fuel) values ($1, 'UP85 BK 1111', 'petrol') returning id",
      [bike],
    )
  ).rows[0].id;
  const sedan = await idOf("cab_categories", "key", "sedan");
  cabVehicleId = (
    await db.query<{ id: string }>(
      "insert into public.vehicles (category_id, registration_no, fuel) values ($1, 'UP85 SD 2222', 'cng') returning id",
      [sedan],
    )
  ).rows[0].id;
}, 60_000);

describe("ride catalog", () => {
  it("is public and seeded with vehicle types, zones, landmarks and a fare per zone, type and mode", async () => {
    const counts = await asAnon(db, async (tx) => {
      const q = async (t: string) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n;
      return {
        types: await q("ride_vehicle_types"),
        zones: await q("ride_zones"),
        points: await q("ride_points"),
        fares: await q("ride_fare_rules"),
      };
    });
    expect(counts.types).toBe(4);
    expect(counts.zones).toBe(4);
    expect(counts.points).toBeGreaterThanOrEqual(15);
    expect(counts.fares).toBe(4 * 4 * 2);
    const { rows } = await db.query<{ enabled: boolean }>(
      "select enabled from public.feature_flags where key = 'booking.rides'",
    );
    expect(rows[0].enabled).toBe(false);
  });

  it("lets only ride managers change fares", async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query("update public.ride_fare_rules set base_paise = 1 returning id")),
    ).resolves.toMatchObject({ rows: [] });
    const updated = await asUser(db, manager, (tx) =>
      tx.query("update public.ride_fare_rules set night_bps = 13000 where zone_id = $1 returning id", [
        vrindavan,
      ]),
    );
    expect(updated.rows.length).toBe(8);
  });

  it("keeps a vehicle either a cab or a ride vehicle, never both or neither", async () => {
    const sedan = await idOf("cab_categories", "key", "sedan");
    await expect(
      db.query(
        "insert into public.vehicles (category_id, ride_vehicle_type_id, registration_no, fuel) values ($1, $2, 'UP85 XX 0001', 'cng')",
        [sedan, bike],
      ),
    ).rejects.toThrow(/vehicles_kind_check/);
    await expect(
      db.query("insert into public.vehicles (registration_no, fuel) values ('UP85 XX 0002', 'cng')"),
    ).rejects.toThrow(/vehicles_kind_check/);
    // A cycle rickshaw needs no registration; a cab still does.
    const rickshaw = await idOf("ride_vehicle_types", "key", "rickshaw");
    await expect(
      db.query("insert into public.vehicles (ride_vehicle_type_id, fuel) values ($1, 'electric')", [
        rickshaw,
      ]),
    ).resolves.toBeTruthy();
    await expect(
      db.query("insert into public.vehicles (category_id, fuel) values ($1, 'cng')", [sedan]),
    ).rejects.toThrow(/vehicles_registration_required/);
  });
});

describe("ride bookings", () => {
  it("confirms a pay-the-driver ride at once and puts it on the board", async () => {
    const r = await book({ user: alice });
    expect(r.status).toBe("confirmed");
    const b = await bookingStatus(r.id);
    expect(b).toMatchObject({ status: "confirmed", payable_now_paise: 0, expires_at: null });
    const ride = await rideOf(r.id);
    expect(ride.status).toBe("requested");
    expect(ride.pickup_otp).toMatch(/^\d{4}$/);
  });

  it("holds an online ride until payment, then cancels it if the booking expires", async () => {
    const r = await book({ user: alice, mode: "full" });
    expect(r.status).toBe("pending_payment");
    expect((await rideOf(r.id)).status).toBe("awaiting_payment");
    await service((tx) => tx.query("update public.bookings set status = 'expired' where id = $1", [r.id]));
    expect((await rideOf(r.id)).status).toBe("cancelled");
  });

  it("supports hourly rides without a drop point", async () => {
    const r = await book({ user: alice, hourly: true, type: car, amount: 70_000 });
    expect((await rideOf(r.id)).status).toBe("requested");
  });

  it("refuses part payment, mismatched totals and direct calls from customers", async () => {
    const p = payload({ user: alice });
    await expect(
      service((tx) =>
        tx.query("select public.create_ride_booking($1, $2, $3)", [
          JSON.stringify({ ...p.booking, payment_mode: "part" }),
          JSON.stringify(p.items),
          JSON.stringify(p.ride),
        ]),
      ),
    ).rejects.toThrow(/payment_mode/);
    await expect(
      service((tx) =>
        tx.query("select public.create_ride_booking($1, $2, $3)", [
          JSON.stringify({
            ...p.booking,
            code: "PSTRIDBAD1",
            tax_paise: 1,
            total_paise: p.booking.total_paise + 1,
          }),
          JSON.stringify(p.items),
          JSON.stringify(p.ride),
        ]),
      ),
    ).rejects.toThrow(/totals_mismatch/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.create_ride_booking($1, $2, $3)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.ride),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("ride dispatch", () => {
  it("assigns a driver, checks the OTP at pickup, completes the booking and takes one rating", async () => {
    const r = await book({ user: alice });
    const ride = await rideOf(r.id);
    await expect(assign(ride.id, cabVehicleId)).rejects.toThrow(/vehicle_unavailable/);
    await assign(ride.id, bikeVehicleId);
    const assigned = await rideOf(r.id);
    expect(assigned).toMatchObject({ status: "assigned", driver_name: "Mohan Lal" });
    expect(assigned.driver_token).toMatch(/^[0-9a-f]{48}$/);

    await expect(step(ride.id, "completed")).rejects.toThrow(/invalid_transition/);
    await step(ride.id, "arrived");
    await expect(step(ride.id, "picked_up", "0000" === ride.pickup_otp ? "1111" : "0000")).rejects.toThrow(
      /otp_mismatch/,
    );
    await step(ride.id, "picked_up", ride.pickup_otp);
    await expect(
      service((tx) => tx.query("select public.rate_ride($1, $2, 5::smallint, '')", [ride.id, alice])),
    ).rejects.toThrow(/invalid_transition/);
    await step(ride.id, "completed");
    expect((await bookingStatus(r.id)).status).toBe("completed");

    await expect(
      service((tx) => tx.query("select public.rate_ride($1, $2, 5::smallint, 'Great')", [ride.id, bob])),
    ).rejects.toThrow(/not_found/);
    await service((tx) =>
      tx.query("select public.rate_ride($1, $2, 5::smallint, 'Great')", [ride.id, alice]),
    );
    await expect(
      service((tx) => tx.query("select public.rate_ride($1, $2, 4::smallint, '')", [ride.id, alice])),
    ).rejects.toThrow(/invalid_transition/);
  });

  it("refuses to dispatch an unpaid online ride", async () => {
    const r = await book({ user: alice, mode: "full" });
    await expect(assign((await rideOf(r.id)).id)).rejects.toThrow(/invalid_transition/);
  });

  it("shows the customer their ride but not the driver link token, and hides it from others", async () => {
    const r = await book({ user: alice });
    const ride = await rideOf(r.id);
    await assign(ride.id);
    const mine = await asUser(db, alice, (tx) =>
      tx.query<{ driver_name: string }>("select driver_name from public.ride_requests where id = $1", [
        ride.id,
      ]),
    );
    expect(mine.rows[0].driver_name).toBe("Mohan Lal");
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select driver_token from public.ride_requests where id = $1", [ride.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    const theirs = await asUser(db, bob, (tx) =>
      tx.query("select id from public.ride_requests where id = $1", [ride.id]),
    );
    expect(theirs.rows).toHaveLength(0);
    const driver = await asUser(db, driverUser, (tx) =>
      tx.query("select id from public.ride_requests where id = $1", [ride.id]),
    );
    expect(driver.rows).toHaveLength(1);
    const events = await asUser(db, alice, (tx) =>
      tx.query("select status::text from public.ride_events where ride_id = $1", [ride.id]),
    );
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it("audits who assigned the ride", async () => {
    const r = await book({ user: alice });
    const ride = await rideOf(r.id);
    await assign(ride.id);
    const { rows } = await db.query<{ actor_id: string }>(
      "select actor_id from public.audit_logs where table_name = 'ride_requests' and new_data->>'id' = $1 and new_data->>'driver_id' is not null order by id desc limit 1",
      [ride.id],
    );
    expect(rows[0].actor_id).toBe(manager);
  });
});
