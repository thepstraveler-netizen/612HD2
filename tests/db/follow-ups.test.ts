import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let superAdmin: string;
let admin: string;
let manager: string;
let customer: string;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "no error";
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  superAdmin = await createUser(db, "owner@example.com");
  admin = await createUser(db, "admin@example.com");
  manager = await createUser(db, "manager@example.com");
  customer = await createUser(db, "guest@example.com");
  await db.query("select public.grant_role_by_email('owner@example.com', 'super_admin')");
  await db.query("select public.grant_role_by_email('admin@example.com', 'admin')");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
}, 60_000);

// ---------------------------------------------------------------- hotel import

type ImportRow = Record<string, string | number | boolean | null>;

const row = (over: ImportRow = {}): ImportRow => ({
  line: 2,
  hotel_slug: "import-test-inn",
  hotel_name: "Import Test Inn",
  status: "draft",
  city: "vrindavan",
  property_type: "guest_house",
  stars: 3,
  room: "Deluxe Room",
  units: 4,
  rate_plan: "Room only",
  meal_plan: "room_only",
  base_price_paise: 250_000,
  extra_adult_paise: 50_000,
  extra_child_paise: 0,
  refundable: true,
  ...over,
});

async function importAs(user: string, rows: ImportRow[]) {
  return asUser(db, user, async (tx) => {
    const { rows: out } = await tx.query<{ r: Record<string, number> }>(
      "select public.import_hotels($1) as r",
      [JSON.stringify(rows)],
    );
    return out[0].r;
  });
}

describe("hotel CSV import", () => {
  it("creates a hotel with its rooms and plans in one go", async () => {
    const result = await importAs(admin, [
      row(),
      row({ line: 3, rate_plan: "With breakfast", meal_plan: "breakfast", base_price_paise: 290_000 }),
      row({ line: 4, room: "Family Suite", units: 2, rate_plan: "Room only", base_price_paise: 400_000 }),
    ]);
    expect(result).toEqual({
      hotels_created: 1,
      hotels_updated: 0,
      rooms_created: 2,
      rooms_updated: 0,
      plans_created: 3,
      plans_updated: 0,
    });
    const { rows } = await db.query<{ name: string; units: number; plans: number }>(
      `select r.name->>'en' as name, r.total_units as units, count(p.id)::int as plans
         from public.hotels h join public.hotel_rooms r on r.hotel_id = h.id
         left join public.hotel_rate_plans p on p.room_id = r.id
        where h.slug = 'import-test-inn' group by r.name, r.total_units, r.sort_order order by r.sort_order`,
    );
    expect(rows).toEqual([
      { name: "Deluxe Room", units: 4, plans: 2 },
      { name: "Family Suite", units: 2, plans: 1 },
    ]);
  });

  it("updates prices on re-import, matching names case-insensitively, and keeps the Hindi name", async () => {
    await db.query(
      `update public.hotels set name = name || '{"hi": "इम्पोर्ट इन"}'::jsonb where slug = 'import-test-inn'`,
    );
    const again = await importAs(admin, [row()]);
    expect(again).toMatchObject({ hotels_updated: 0, rooms_updated: 0, plans_created: 0, plans_updated: 0 });

    const changed = await importAs(admin, [
      row({
        hotel_name: "Import Test Inn & Suites",
        room: "DELUXE room",
        units: 5,
        base_price_paise: 260_000,
      }),
    ]);
    expect(changed).toEqual({
      hotels_created: 0,
      hotels_updated: 1,
      rooms_created: 0,
      rooms_updated: 1,
      plans_created: 0,
      plans_updated: 1,
    });
    const { rows } = await db.query<{ name: { en: string; hi: string }; price: number }>(
      `select h.name, p.base_price_paise as price from public.hotels h
         join public.hotel_rooms r on r.hotel_id = h.id join public.hotel_rate_plans p on p.room_id = r.id
        where h.slug = 'import-test-inn' and r.name->>'en' = 'Deluxe Room' and p.name->>'en' = 'Room only'`,
    );
    expect(rows[0]).toEqual({ name: { en: "Import Test Inn & Suites", hi: "इम्पोर्ट इन" }, price: 260_000 });
  });

  it("rolls the whole file back when one row is bad, and records who imported", async () => {
    const message = await errorOf(() =>
      importAs(admin, [
        row({ hotel_slug: "rollback-inn" }),
        row({ line: 3, hotel_slug: "other-inn", city: "atlantis" }),
      ]),
    );
    expect(message).toContain("unknown_city:3:atlantis");
    const { rows } = await db.query(
      "select 1 from public.hotels where slug in ('rollback-inn', 'other-inn')",
    );
    expect(rows).toHaveLength(0);

    const audit = await db.query<{ actor_id: string }>(
      `select actor_id from public.audit_logs where table_name = 'hotel_rate_plans' and action = 'INSERT'
        order by id desc limit 1`,
    );
    expect(audit.rows[0].actor_id).toBe(admin);
  });

  it("refuses deleted hotels and people without hotels.write", async () => {
    await db.query("update public.hotels set deleted_at = now() where slug = 'import-test-inn'");
    expect(await errorOf(() => importAs(admin, [row()]))).toContain("deleted_hotel:2:import-test-inn");
    expect(await errorOf(() => importAs(customer, [row({ hotel_slug: "sneaky-inn" })]))).toContain(
      "insufficient_privilege",
    );
  });
});

// ---------------------------------------------------------------- roles

async function roleId(key: string) {
  const { rows } = await db.query<{ id: string }>("select id from public.roles where key = $1", [key]);
  return rows[0].id;
}

describe("staff and roles", () => {
  it("lets an admin grant and revoke staff roles, audited", async () => {
    const agent = await roleId("agent");
    await asUser(db, admin, (tx) =>
      tx.query("insert into public.user_roles (user_id, role_id, granted_by) values ($1, $2, $3)", [
        customer,
        agent,
        admin,
      ]),
    );
    const removed = await asUser(db, admin, (tx) =>
      tx.query("delete from public.user_roles where user_id = $1 and role_id = $2 returning user_id", [
        customer,
        agent,
      ]),
    );
    expect(removed.rows).toHaveLength(1);
    const { rows } = await db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from public.audit_logs where table_name = 'user_roles'
         and coalesce(new_data, old_data)->>'user_id' = $1 and coalesce(new_data, old_data)->>'role_id' = $2
       order by id`,
      [customer, agent],
    );
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["INSERT", "DELETE"]));
    expect(rows.every((r) => r.actor_id === admin)).toBe(true);
  });

  it("keeps super admin in super admins' hands and never removes the last one", async () => {
    const superRole = await roleId("super_admin");
    expect(
      await errorOf(() =>
        asUser(db, admin, (tx) =>
          tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [admin, superRole]),
        ),
      ),
    ).toMatch(/row-level security/);
    // An admin can't see the super admin row to delete it.
    const hidden = await asUser(db, admin, (tx) =>
      tx.query("delete from public.user_roles where user_id = $1 and role_id = $2 returning user_id", [
        superAdmin,
        superRole,
      ]),
    );
    expect(hidden.rows).toHaveLength(0);

    expect(
      await errorOf(() =>
        asUser(db, superAdmin, (tx) =>
          tx.query("delete from public.user_roles where user_id = $1 and role_id = $2", [
            superAdmin,
            superRole,
          ]),
        ),
      ),
    ).toContain("last_super_admin");

    // With a second super admin, the first can step down.
    await asUser(db, superAdmin, (tx) =>
      tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [admin, superRole]),
    );
    await asUser(db, admin, (tx) =>
      tx.query("delete from public.user_roles where user_id = $1 and role_id = $2", [superAdmin, superRole]),
    );
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.user_roles where role_id = $1",
      [superRole],
    );
    expect(rows[0].n).toBe(1);
  });

  it("stops a manager without users.manage_roles from granting anything", async () => {
    const agent = await roleId("agent");
    expect(
      await errorOf(() =>
        asUser(db, manager, (tx) =>
          tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [customer, agent]),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

// ---------------------------------------------------------------- dispatch overlap

let codeSeq = 0;
let fleet: { category: string; place: string; rideType: string; zone: string };

async function seedFleet() {
  const { rows } = await db.query<{ category: string; place: string; ride_type: string; zone: string }>(
    `select (select id from public.cab_categories order by sort_order limit 1) as category,
            (select id from public.cab_places order by sort_order limit 1) as place,
            (select id from public.ride_vehicle_types order by sort_order limit 1) as ride_type,
            (select id from public.ride_zones order by sort_order limit 1) as zone`,
  );
  fleet = {
    category: rows[0].category,
    place: rows[0].place,
    rideType: rows[0].ride_type,
    zone: rows[0].zone,
  };
}

async function driver(name: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.drivers (full_name, phone) values ($1, '+919800000000') returning id",
    [name],
  );
  return rows[0].id;
}

async function cabVehicle(reg: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.vehicles (category_id, registration_no, fuel) values ($1, $2, 'diesel') returning id",
    [fleet.category, reg],
  );
  return rows[0].id;
}

async function booking(service: "cab" | "ride") {
  codeSeq += 1;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.bookings (code, user_id, service, status, contact_name, contact_phone, subtotal_paise,
       tax_paise, total_paise, payable_now_paise, paid_paise, payment_mode, price_breakdown, confirmed_at)
     values ($1, $2, $3, 'confirmed', 'Guest', '+919876543210', 100, 0, 100, 100, 100, 'full', '{}', now())
     returning id`,
    [`PSTOVL${String(codeSeq).padStart(4, "0")}`, customer, service],
  );
  return rows[0].id;
}

async function trip(pickup: string, opts: { returnAt?: string; distanceKm?: number } = {}) {
  const bookingId = await booking("cab");
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trips (booking_id, trip_type, category_id, pickup_place_id, pickup_address, pickup_at,
       return_at, distance_km, passengers, status)
     values ($1, 'one_way', $2, $3, 'Prem Mandir gate', $4, $5, $6, 2, 'unassigned') returning id`,
    [bookingId, fleet.category, fleet.place, pickup, opts.returnAt ?? null, opts.distanceKm ?? null],
  );
  return rows[0].id;
}

async function ride(pickup: string, hours: number) {
  const bookingId = await booking("ride");
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ride_requests (booking_id, vehicle_type_id, zone_id, mode, hours, pickup_lat, pickup_lng,
       pickup_address, pickup_at, passengers, status)
     values ($1, $2, $3, 'hourly', $4, 27.57, 77.69, 'ISKCON gate', $5, 1, 'requested') returning id`,
    [bookingId, fleet.rideType, fleet.zone, hours, pickup],
  );
  return rows[0].id;
}

const assignTrip = (tripId: string, driverId: string, vehicleId: string) =>
  service((tx) =>
    tx.query("select public.assign_trip($1, $2, $3, $4)", [tripId, driverId, vehicleId, manager]),
  );

const assignRide = (rideId: string, driverId: string) =>
  service((tx) => tx.query("select public.assign_ride($1, $2, null, $3)", [rideId, driverId, manager]));

describe("no double-booked drivers or vehicles", () => {
  beforeAll(seedFleet);

  it("refuses a driver whose active trip overlaps, but allows a later one", async () => {
    const ramesh = await driver("Ramesh Kumar");
    const [car1, car2] = [await cabVehicle("UP85 AB 1001"), await cabVehicle("UP85 AB 1002")];
    // 120 km at the default 40 km/h → 3 hours, plus 30 minutes' buffer each side.
    const first = await trip("2026-12-01T04:00:00Z", { distanceKm: 120 });
    await assignTrip(first, ramesh, car1);

    const clash = await trip("2026-12-01T07:15:00Z");
    expect(await errorOf(() => assignTrip(clash, ramesh, car2))).toMatch(/driver_busy:PSTOVL\d{4}/);

    const later = await trip("2026-12-01T08:00:00Z");
    await assignTrip(later, ramesh, car2);

    // Re-assigning the same trip to the same driver is not a clash with itself.
    await assignTrip(first, ramesh, car1);
  });

  it("refuses a vehicle already out with another driver", async () => {
    const [a, b] = [await driver("Suresh Yadav"), await driver("Mohan Lal")];
    const car = await cabVehicle("UP85 CD 2001");
    const round = await trip("2026-12-02T03:00:00Z", { returnAt: "2026-12-02T15:00:00Z" });
    await assignTrip(round, a, car);
    const other = await trip("2026-12-02T10:00:00Z");
    expect(await errorOf(() => assignTrip(other, b, car))).toMatch(/vehicle_busy/);
  });

  it("checks cab trips and local rides against each other, and frees the driver when a job ends", async () => {
    const gopal = await driver("Gopal Das");
    const car = await cabVehicle("UP85 EF 3001");
    const hourly = await ride("2026-12-03T05:00:00Z", 4);
    await assignRide(hourly, gopal);

    const cab = await trip("2026-12-03T08:00:00Z");
    expect(await errorOf(() => assignTrip(cab, gopal, car))).toMatch(/driver_busy/);

    await db.query("update public.ride_requests set status = 'cancelled' where id = $1", [hourly]);
    await assignTrip(cab, gopal, car);
  });

  it("reads the buffer from the admin setting", async () => {
    const hari = await driver("Hari Om");
    const [c1, c2] = [await cabVehicle("UP85 GH 4001"), await cabVehicle("UP85 GH 4002")];
    const first = await trip("2026-12-04T04:00:00Z", { distanceKm: 40 }); // 1 hour
    await assignTrip(first, hari, c1);
    const next = await trip("2026-12-04T05:20:00Z"); // 20 minutes after the estimated end
    expect(await errorOf(() => assignTrip(next, hari, c2))).toMatch(/driver_busy/);
    await db.query(
      `update public.settings set value = jsonb_set(value, '{buffer_minutes}', '10') where key = 'dispatch.overlap'`,
    );
    await assignTrip(next, hari, c2);
  });

  it("keeps the overlap helpers closed to API roles", async () => {
    expect(
      await errorOf(() =>
        asUser(db, admin, (tx) =>
          tx.query(
            "select * from public.dispatch_conflict(gen_random_uuid(), null, tstzrange(now(), now() + interval '1 hour'), null, null)",
          ),
        ),
      ),
    ).toContain("permission denied");
  });
});
