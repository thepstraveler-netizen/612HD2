import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let owner: string;
let manager: string;
let homestay: { hotel: string; room: string; plan: string };
let inn: { hotel: string; room: string; plan: string };
let codeSeq = 0;

async function roomOf(slug: string) {
  const { rows } = await db.query<{ hotel: string; room: string; plan: string }>(
    `select h.id as hotel, r.id as room, p.id as plan
       from public.hotels h join public.hotel_rooms r on r.hotel_id = h.id join public.hotel_rate_plans p on p.room_id = r.id
      where h.slug = $1 order by r.sort_order, p.sort_order limit 1`,
    [slug],
  );
  return rows[0];
}

type Opts = {
  user: string;
  target: { hotel: string; room: string; plan: string };
  checkIn?: string;
  checkOut?: string;
  rooms?: number;
  mode?: "full" | "part" | "pay_at_hotel";
  amount?: number;
  coupon?: { id: string; discount: number };
  expiresAt?: string;
};

function payload(o: Opts) {
  const amount = o.amount ?? 200_000;
  const discount = o.coupon?.discount ?? 0;
  const tax = Math.round((amount - discount) * 0.05);
  const total = amount - discount + tax;
  codeSeq += 1;
  return {
    booking: {
      code: `PSTTEST${String(codeSeq).padStart(3, "0")}`,
      user_id: o.user,
      hotel_id: o.target.hotel,
      room_id: o.target.room,
      check_in: o.checkIn ?? "2026-12-10",
      check_out: o.checkOut ?? "2026-12-12",
      rooms: o.rooms ?? 1,
      adults: o.rooms ?? 1,
      children: 0,
      contact_name: "Test Guest",
      contact_email: "guest@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: discount,
      tax_paise: tax,
      total_paise: total,
      payable_now_paise: o.mode === "pay_at_hotel" ? 0 : total,
      payment_mode: o.mode ?? "full",
      coupon_id: o.coupon?.id ?? null,
      price_breakdown: { lines: [] },
      expires_at: o.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    items: [
      {
        kind: "room",
        line_key: "room:1",
        description: "Room",
        amount_paise: amount,
        discount_paise: discount,
        tax_rate_bps: 500,
        tax_paise: tax,
      },
    ],
    guests: [{ full_name: "Test Guest", is_primary: true }],
  };
}

async function book(o: Opts): Promise<{ id: string; code: string; status: string }> {
  const p = payload(o);
  return asService(db, async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string; status: string } }>(
      "select public.create_hotel_booking($1, $2, $3) as r",
      [JSON.stringify(p.booking), JSON.stringify(p.items), JSON.stringify(p.guests)],
    );
    return rows[0].r;
  });
}

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function inventory(roomId: string, date: string) {
  const { rows } = await db.query<{ sold_units: number; held_units: number }>(
    "select sold_units, held_units from public.hotel_inventory where room_id = $1 and date = $2",
    [roomId, date],
  );
  return rows[0];
}

async function bookingRow(id: string) {
  const { rows } = await db.query<{ status: string; paid_paise: number; refunded_paise: number }>(
    "select status::text, paid_paise, refunded_paise from public.bookings where id = $1",
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  owner = await createUser(db, "owner@example.com");
  manager = await createUser(db, "manager@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  homestay = await roomOf("demo-braj-homestay"); // 2 units
  inn = await roomOf("demo-janmabhoomi-inn"); // 10 units
  await db.query(`
    with v as (insert into public.vendors (kind, name, slug, status) values ('hotel', 'Inn Vendor', 'inn-vendor', 'active') returning id)
    update public.hotels set vendor_id = (select id from v) where slug = 'demo-janmabhoomi-inn'`);
  await db.query(
    `insert into public.vendor_members (vendor_id, user_id) select id, $1 from public.vendors where slug = 'inn-vendor'`,
    [owner],
  );
}, 60_000);

describe("inventory holds", () => {
  it("never sells more rooms than exist", async () => {
    await book({ user: alice, target: homestay, rooms: 2, checkIn: "2026-12-01", checkOut: "2026-12-03" });
    expect(await inventory(homestay.room, "2026-12-01")).toEqual({ sold_units: 0, held_units: 2 });
    await expect(
      book({ user: bob, target: homestay, rooms: 1, checkIn: "2026-12-02", checkOut: "2026-12-04" }),
    ).rejects.toThrow(/sold_out/);
    // The failed attempt left nothing behind.
    expect((await inventory(homestay.room, "2026-12-03"))?.held_units ?? 0).toBe(0);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.bookings where user_id = $1",
      [bob],
    );
    expect(rows[0].n).toBe(0);
  });

  it("frees rooms held by an unpaid booking once its hold expires", async () => {
    const stale = await book({
      user: alice,
      target: homestay,
      rooms: 2,
      checkIn: "2026-12-20",
      checkOut: "2026-12-21",
    });
    await db.query(
      "update public.inventory_locks set expires_at = now() - interval '1 minute' where booking_id = $1",
      [stale.id],
    );
    await db.query("update public.bookings set expires_at = now() - interval '1 minute' where id = $1", [
      stale.id,
    ]);
    const fresh = await book({
      user: bob,
      target: homestay,
      rooms: 2,
      checkIn: "2026-12-20",
      checkOut: "2026-12-21",
    });
    expect(fresh.status).toBe("pending_payment");
    const expired = await service(
      async (tx) => (await tx.query<{ n: number }>("select public.expire_stale_bookings() as n")).rows[0].n,
    );
    expect(expired).toBeGreaterThanOrEqual(1);
    expect((await bookingRow(stale.id)).status).toBe("expired");
    expect(await inventory(homestay.room, "2026-12-20")).toEqual({ sold_units: 0, held_units: 2 });
  });

  it("refuses closed nights", async () => {
    await db.query(
      "insert into public.hotel_inventory (room_id, date, is_closed) values ($1, '2027-01-05', true)",
      [inn.room],
    );
    await expect(
      book({ user: alice, target: inn, checkIn: "2027-01-04", checkOut: "2027-01-06" }),
    ).rejects.toThrow(/closed/);
  });

  it("rejects line items that do not add up to the totals", async () => {
    const p = payload({ user: alice, target: inn });
    p.items[0].tax_paise += 1;
    await expect(
      service((tx) =>
        tx.query("select public.create_hotel_booking($1, $2, $3)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.guests),
        ]),
      ),
    ).rejects.toThrow(/totals_mismatch/);
  });
});

describe("payments", () => {
  async function pay(bookingId: string, orderId: string, amount: number) {
    await service((tx) =>
      tx.query("select public.attach_payment_order($1, $2, $3)", [bookingId, orderId, amount]),
    );
  }
  const capture = (orderId: string, paymentId: string, amount: number) =>
    service(
      async (tx) =>
        (
          await tx.query<{ r: { result: string } }>("select public.record_payment($1) as r", [
            JSON.stringify({
              order_id: orderId,
              payment_id: paymentId,
              status: "captured",
              amount_paise: amount,
            }),
          ])
        ).rows[0].r.result,
    );

  it("confirms once however many times the payment is replayed", async () => {
    const b = await book({ user: alice, target: inn, checkIn: "2027-02-01", checkOut: "2027-02-02" });
    const total = 210_000;
    await pay(b.id, "order_A", total);
    expect(await capture("order_A", "pay_A", total)).toBe("confirmed");
    expect(await capture("order_A", "pay_A", total)).toBe("duplicate");
    expect(await capture("order_A", "pay_A", total)).toBe("duplicate");
    expect(await bookingRow(b.id)).toMatchObject({ status: "confirmed", paid_paise: total });
    expect(await inventory(inn.room, "2027-02-01")).toEqual({ sold_units: 1, held_units: 0 });
    const { rows } = await db.query<{ n: number; number: string }>(
      "select count(*)::int as n, max(number) as number from public.invoices where booking_id = $1",
      [b.id],
    );
    expect(rows[0].n).toBe(1);
    expect(rows[0].number).toMatch(/^PST\/\d{2}-\d{2}\/\d{5}$/);
  });

  it("ignores a captured amount that differs from the order", async () => {
    const b = await book({ user: alice, target: inn, checkIn: "2027-02-03", checkOut: "2027-02-04" });
    await pay(b.id, "order_B", 210_000);
    expect(await capture("order_B", "pay_B", 100)).toBe("amount_mismatch");
    expect((await bookingRow(b.id)).status).toBe("pending_payment");
  });

  it("de-duplicates webhook deliveries on the event id", async () => {
    const insert = () =>
      service((tx) =>
        tx.query(
          "insert into public.payment_events (event_id, event_type, payload) values ('evt_1', 'payment.captured', '{}') on conflict do nothing returning id",
        ),
      );
    expect((await insert()).rows).toHaveLength(1);
    expect((await insert()).rows).toHaveLength(0);
  });

  it("reports a late payment for rooms sold meanwhile so it can be refunded", async () => {
    const late = await book({
      user: alice,
      target: homestay,
      rooms: 2,
      checkIn: "2027-03-01",
      checkOut: "2027-03-02",
    });
    await pay(late.id, "order_C", 210_000);
    await db.query(
      "update public.inventory_locks set expires_at = now() - interval '1 minute' where booking_id = $1",
      [late.id],
    );
    const other = await book({
      user: bob,
      target: homestay,
      rooms: 1,
      checkIn: "2027-03-01",
      checkOut: "2027-03-02",
    });
    await pay(other.id, "order_D", 210_000);
    expect(await capture("order_D", "pay_D", 210_000)).toBe("confirmed");
    expect(await capture("order_C", "pay_C", 210_000)).toBe("no_inventory");
    expect(await bookingRow(late.id)).toMatchObject({ status: "failed", paid_paise: 210_000 });
  });

  it("confirms pay-at-hotel bookings without payment", async () => {
    const b = await book({
      user: alice,
      target: inn,
      mode: "pay_at_hotel",
      checkIn: "2027-02-10",
      checkOut: "2027-02-11",
    });
    expect(b.status).toBe("confirmed");
    expect(await inventory(inn.room, "2027-02-10")).toEqual({ sold_units: 1, held_units: 0 });
  });

  it("keeps a goodwill refund's stay confirmed and audits payment links", async () => {
    const b = await book({ user: alice, target: inn, checkIn: "2027-02-20", checkOut: "2027-02-21" });
    await pay(b.id, "order_G", 210_000);
    await capture("order_G", "pay_G", 210_000);
    const paymentId = (
      await db.query<{ id: string }>("select id from public.payments where provider_order_id = 'order_G'")
    ).rows[0].id;
    await service((tx) =>
      tx.query("select public.record_refund($1)", [
        JSON.stringify({
          payment_id: paymentId,
          amount_paise: 50_000,
          provider_refund_id: "rfnd_G",
          actor: manager,
        }),
      ]),
    );
    expect(await bookingRow(b.id)).toMatchObject({ status: "confirmed", refunded_paise: 50_000 });

    await service((tx) =>
      tx.query("select public.create_payment_link_payment($1, 'plink_G', 'https://rzp.io/x', 10000, $2)", [
        b.id,
        manager,
      ]),
    );
    const audit = await db.query<{ actor_id: string }>(
      "select actor_id from public.audit_logs where table_name = 'payments' and new_data->>'payment_link_id' = 'plink_G'",
    );
    expect(audit.rows[0]?.actor_id).toBe(manager);
  });

  it("cancels, returns the room and records the refund", async () => {
    const b = await book({ user: alice, target: inn, checkIn: "2027-02-15", checkOut: "2027-02-16" });
    await pay(b.id, "order_E", 210_000);
    await capture("order_E", "pay_E", 210_000);
    await service((tx) => tx.query("select public.cancel_booking($1, $2, 'change of plans')", [b.id, alice]));
    expect(await inventory(inn.room, "2027-02-15")).toEqual({ sold_units: 0, held_units: 0 });
    const paymentId = (
      await db.query<{ id: string }>("select id from public.payments where provider_order_id = 'order_E'")
    ).rows[0].id;
    const refund = (amount: number, id: string) =>
      service((tx) =>
        tx.query("select public.record_refund($1)", [
          JSON.stringify({
            payment_id: paymentId,
            amount_paise: amount,
            provider_refund_id: id,
            actor: manager,
          }),
        ]),
      );
    await refund(100_000, "rfnd_1");
    expect(await bookingRow(b.id)).toMatchObject({ status: "partially_refunded", refunded_paise: 100_000 });
    await refund(100_000, "rfnd_1"); // replay
    expect((await bookingRow(b.id)).refunded_paise).toBe(100_000);
    await expect(refund(200_000, "rfnd_2")).rejects.toThrow(/refund_exceeds_paid/);
    await refund(110_000, "rfnd_3");
    expect(await bookingRow(b.id)).toMatchObject({ status: "refunded", refunded_paise: 210_000 });
    const { rows } = await db.query<{ actor_id: string }>(
      "select actor_id from public.audit_logs where table_name = 'refunds' order by id desc limit 1",
    );
    expect(rows[0].actor_id).toBe(manager);
  });
});

describe("coupons", () => {
  it("enforces the per-user limit under the booking transaction", async () => {
    const { rows } = await db.query<{ id: string }>(
      "select id from public.coupons where code = 'DEMOFLAT300'",
    );
    const coupon = { id: rows[0].id, discount: 30_000 };
    await book({
      user: bob,
      target: inn,
      coupon,
      amount: 400_000,
      checkIn: "2027-04-01",
      checkOut: "2027-04-02",
    });
    await expect(
      book({
        user: bob,
        target: inn,
        coupon,
        amount: 400_000,
        checkIn: "2027-04-03",
        checkOut: "2027-04-04",
      }),
    ).rejects.toThrow(/coupon_used/);
  });

  it("hides private coupons from the public", async () => {
    const codes = await asAnon(db, async (tx) =>
      (await tx.query<{ code: string }>("select code from public.coupons order by code")).rows.map(
        (r) => r.code,
      ),
    );
    expect(codes).toEqual(["DEMO10", "DEMOFLAT300"]);
  });
});

describe("booking RLS", () => {
  const visible = (user: string) =>
    asUser(db, user, async (tx) =>
      (await tx.query<{ user_id: string }>("select user_id from public.bookings")).rows.map((r) => r.user_id),
    );

  it("shows customers only their own bookings", async () => {
    const mine = await visible(alice);
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine)).toEqual(new Set([alice]));
    expect(
      await asAnon(db, async (tx) => (await tx.query("select id from public.bookings")).rows),
    ).toHaveLength(0);
  });

  it("shows a hotel's bookings to its vendor and all to staff", async () => {
    const vendorRows = await asUser(
      db,
      owner,
      async (tx) => (await tx.query<{ hotel_id: string }>("select hotel_id from public.bookings")).rows,
    );
    expect(vendorRows.length).toBeGreaterThan(0);
    expect(vendorRows.every((r) => r.hotel_id === inn.hotel)).toBe(true);
    expect((await visible(manager)).length).toBeGreaterThan(vendorRows.length);
  });

  it("lets nobody but the server write bookings or call booking functions", async () => {
    const p = payload({ user: alice, target: inn });
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.create_hotel_booking($1, $2, $3)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.guests),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          "insert into public.bookings (code, service, contact_name, contact_phone, subtotal_paise, tax_paise, total_paise, payable_now_paise, payment_mode, price_breakdown) values ('HACK01', 'cab', 'Hacker', '+919999999999', 0, 0, 0, 0, 'full', '{}')",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await asUser(db, alice, (tx) =>
      tx.query("update public.bookings set paid_paise = total_paise where user_id = $1 returning id", [
        alice,
      ]),
    );
    expect(updated.rows).toHaveLength(0);
    await expect(
      asUser(db, manager, (tx) => tx.query("select public.record_payment('{}'::jsonb)")),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets customers read their own invoices and payments only", async () => {
    const own = await asUser(
      db,
      alice,
      async (tx) => (await tx.query("select id from public.invoices")).rows,
    );
    const other = await asUser(
      db,
      bob,
      async (tx) =>
        (
          await tx.query(
            "select b.user_id from public.invoices i join public.bookings b on b.id = i.booking_id",
          )
        ).rows,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(other.every((r) => (r as { user_id: string }).user_id === bob)).toBe(true);
    const events = await asUser(
      db,
      alice,
      async (tx) => (await tx.query("select id from public.payment_events")).rows,
    );
    expect(events).toHaveLength(0);
  });
});
