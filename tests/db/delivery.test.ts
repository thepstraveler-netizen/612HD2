import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let manager: string;
let cook: string;
let riderUser: string;
let restaurant: string;
let mart: string;
let pharmacy: string;
let vrindavan: string;
let govardhan: string;
let thali: string;
let deluxe: string;
let peda: string;
let water: string;
let platformRider: string;
let otherVendorRider: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function idOf(table: string, column: string, value: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.${table} where ${column} = $1`, [
    value,
  ]);
  return rows[0].id;
}

async function itemId(store: string, nameEn: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.store_items where store_id = $1 and name->>'en' like $2",
    [store, `${nameEn}%`],
  );
  return rows[0].id;
}

type Line = { item: string; variant?: string; qty: number; price: number; name?: string };

type Opts = {
  user: string;
  store?: string;
  zone?: string;
  mode?: "full" | "pay_at_hotel";
  lines?: Line[];
  prescription?: string;
  quote?: string;
};

function payload(o: Opts) {
  codeSeq += 1;
  const lines = o.lines ?? [{ item: thali, variant: deluxe, qty: 1, price: 29_000 }];
  const amount = lines.reduce((s, l) => s + l.qty * l.price, 0);
  return {
    booking: {
      code: `PSTORD${String(codeSeq).padStart(3, "0")}`,
      user_id: o.user,
      contact_name: "Food Lover",
      contact_email: "food@example.com",
      contact_phone: "+919876543210",
      subtotal_paise: amount,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: amount,
      payable_now_paise: amount,
      payment_mode: o.mode ?? "pay_at_hotel",
      price_breakdown: { lines: [] },
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    items: lines.map((l, i) => ({
      kind: "item",
      line_key: `item:${i}`,
      description: l.name ?? "Item",
      quantity: l.qty,
      amount_paise: l.qty * l.price,
      discount_paise: 0,
      tax_rate_bps: 0,
      tax_paise: 0,
      sac: "996331",
    })),
    order: {
      store_id: o.store ?? restaurant,
      zone_id: o.zone ?? vrindavan,
      address: { contact_name: "Food Lover", phone: "+919876543210", line1: "Room 12, Radha Kunj" },
      prescription_id: o.prescription ?? null,
      quote_id: o.quote ?? null,
    },
    orderItems: lines.map((l) => ({
      item_id: l.item,
      variant_id: l.variant ?? null,
      name: l.name ?? "Item",
      addons: [],
      quantity: l.qty,
      unit_price_paise: l.price,
      line_total_paise: l.qty * l.price,
    })),
  };
}

async function order(o: Opts) {
  const p = payload(o);
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string; order_id: string; status: string } }>(
      "select public.create_order($1, $2, $3, $4) as r",
      [JSON.stringify(p.booking), JSON.stringify(p.items), JSON.stringify(p.order), JSON.stringify(p.orderItems)],
    );
    return rows[0].r;
  });
}

async function orderOf(id: string) {
  const { rows } = await db.query<{
    status: string;
    delivery_otp: string;
    partner_token: string | null;
    partner_name: string | null;
    eta_at: string | null;
    booking_status: string;
  }>(
    `select o.status::text, o.delivery_otp, o.partner_token, o.partner_name, o.eta_at, b.status::text as booking_status
       from public.orders o join public.bookings b on b.id = o.booking_id where o.id = $1`,
    [id],
  );
  return rows[0];
}

async function stockOf(id: string, table = "store_items") {
  const { rows } = await db.query<{ stock: number | null }>(`select stock from public.${table} where id = $1`, [id]);
  return rows[0].stock;
}

const step = (id: string, status: string, source = "vendor", otp: string | null = null) =>
  service((tx) =>
    tx.query("select public.set_order_status($1, $2::public.order_status, $3, $4, null, $5)", [
      id,
      status,
      manager,
      source,
      otp,
    ]),
  );

const assign = (id: string, partner: string) =>
  service((tx) => tx.query("select public.assign_delivery_partner($1, $2, $3)", [id, partner, manager]));

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  manager = await createUser(db, "manager@example.com");
  cook = await createUser(db, "cook@example.com");
  riderUser = await createUser(db, "rider@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  restaurant = await idOf("stores", "slug", "demo-brajwasi-bhojnalaya");
  mart = await idOf("stores", "slug", "demo-vrinda-mart");
  pharmacy = await idOf("stores", "slug", "demo-shri-hari-medicos");
  vrindavan = await idOf("delivery_zones", "slug", "vrindavan");
  govardhan = await idOf("delivery_zones", "slug", "govardhan");
  thali = await itemId(restaurant, "Braj Thali");
  deluxe = (
    await db.query<{ id: string }>("select id from public.item_variants where item_id = $1 and name->>'en' like 'Deluxe%'", [
      thali,
    ])
  ).rows[0].id;
  peda = await itemId(restaurant, "Mathura peda");
  water = await itemId(mart, "Packaged drinking water");
  const vendorId = (await db.query<{ vendor_id: string }>("select vendor_id from public.stores where id = $1", [restaurant]))
    .rows[0].vendor_id;
  await db.query("insert into public.vendor_members (vendor_id, user_id) values ($1, $2)", [vendorId, cook]);
  platformRider = (
    await db.query<{ id: string }>(
      "insert into public.delivery_partners (full_name, phone, user_id) values ('Kishan', '+919811111111', $1) returning id",
      [riderUser],
    )
  ).rows[0].id;
  const martVendor = (await db.query<{ vendor_id: string }>("select vendor_id from public.stores where id = $1", [mart]))
    .rows[0].vendor_id;
  otherVendorRider = (
    await db.query<{ id: string }>(
      "insert into public.delivery_partners (full_name, phone, vendor_id) values ('Mart Rider', '+919811111112', $1) returning id",
      [martVendor],
    )
  ).rows[0].id;
}, 60_000);

describe("delivery catalog", () => {
  it("is public and seeded with zones, demo stores and a menu, behind feature flags", async () => {
    const counts = await asAnon(db, async (tx) => {
      const q = async (t: string) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n;
      return {
        zones: await q("delivery_zones"),
        stores: await q("stores"),
        items: await q("store_items"),
        variants: await q("item_variants"),
        addons: await q("item_addons"),
      };
    });
    expect(counts).toMatchObject({ zones: 4, stores: 3, variants: 2, addons: 3 });
    expect(counts.items).toBeGreaterThanOrEqual(8);
    const { rows } = await db.query<{ key: string; enabled: boolean }>(
      "select key, enabled from public.feature_flags where key like 'booking.%' and key in ('booking.food', 'booking.essentials', 'booking.medicine') order by key",
    );
    expect(rows.map((r) => [r.key, r.enabled])).toEqual([
      ["booking.essentials", false],
      ["booking.food", false],
      ["booking.medicine", false],
    ]);
  });

  it("requires a drug licence for pharmacies and rejects Jain non-veg items", async () => {
    const vendor = (await db.query<{ vendor_id: string }>("select vendor_id from public.stores where id = $1", [pharmacy]))
      .rows[0].vendor_id;
    await expect(
      db.query("insert into public.stores (vendor_id, kind, slug, name) values ($1, 'pharmacy', 'no-licence', '{\"en\": \"X\"}')", [
        vendor,
      ]),
    ).rejects.toThrow(/check/);
    await expect(
      db.query(
        "insert into public.store_items (store_id, name, diet, is_jain, price_paise) values ($1, '{\"en\": \"X\"}', 'non_veg', true, 100)",
        [restaurant],
      ),
    ).rejects.toThrow(/check/);
  });

  it("lets the store's own vendor edit its menu, and nobody else's", async () => {
    const mine = await asUser(db, cook, (tx) =>
      tx.query("update public.store_items set is_available = true where store_id = $1 returning id", [restaurant]),
    );
    expect(mine.rows.length).toBeGreaterThan(0);
    const theirs = await asUser(db, cook, (tx) =>
      tx.query("update public.store_items set is_available = false where store_id = $1 returning id", [mart]),
    );
    expect(theirs.rows).toHaveLength(0);
    const customer = await asUser(db, alice, (tx) =>
      tx.query("update public.store_items set price_paise = 1 where store_id = $1 returning id", [restaurant]),
    );
    expect(customer.rows).toHaveLength(0);
  });

  it("keeps each address book private to its owner", async () => {
    await asUser(db, alice, (tx) =>
      tx.query(
        "insert into public.addresses (user_id, contact_name, phone, line1, zone_id) values ($1, 'Alice', '+919876543210', 'Room 12', $2)",
        [alice, vrindavan],
      ),
    );
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(
          "insert into public.addresses (user_id, contact_name, phone, line1) values ($1, 'Bob', '+919876543210', 'Room 13')",
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const seen = await asUser(db, bob, (tx) => tx.query("select id from public.addresses"));
    expect(seen.rows).toHaveLength(0);
  });
});

describe("orders", () => {
  it("places a cash-on-delivery order at once, takes tracked stock and books it under food", async () => {
    const before = await stockOf(peda);
    const r = await order({
      user: alice,
      lines: [
        { item: thali, variant: deluxe, qty: 1, price: 29_000 },
        { item: peda, qty: 2, price: 12_000 },
      ],
    });
    expect(r.status).toBe("confirmed");
    expect(await orderOf(r.order_id)).toMatchObject({ status: "placed", booking_status: "confirmed" });
    expect((await orderOf(r.order_id)).delivery_otp).toMatch(/^\d{4}$/);
    expect(await stockOf(peda)).toBe((before ?? 0) - 2);
    const { rows } = await db.query<{ service: string; vendor_id: string | null }>(
      "select service::text, vendor_id from public.bookings where id = $1",
      [r.id],
    );
    expect(rows[0].service).toBe("food");
    expect(rows[0].vendor_id).not.toBeNull();
  });

  it("books essentials under their own service", async () => {
    const r = await order({ user: alice, store: mart, lines: [{ item: water, qty: 3, price: 2000 }] });
    const { rows } = await db.query<{ service: string }>("select service::text from public.bookings where id = $1", [r.id]);
    expect(rows[0].service).toBe("essentials");
  });

  it("holds an online order until payment and returns the stock when it expires", async () => {
    const before = await stockOf(peda);
    const r = await order({ user: alice, mode: "full", lines: [{ item: peda, qty: 1, price: 12_000 }] });
    expect(r.status).toBe("pending_payment");
    expect((await orderOf(r.order_id)).status).toBe("awaiting_payment");
    expect(await stockOf(peda)).toBe((before ?? 0) - 1);
    await service((tx) => tx.query("update public.bookings set status = 'expired' where id = $1", [r.id]));
    expect((await orderOf(r.order_id)).status).toBe("cancelled");
    expect(await stockOf(peda)).toBe(before);
  });

  it("places an online order once the booking is paid", async () => {
    const r = await order({ user: alice, mode: "full" });
    await service((tx) => tx.query("update public.bookings set status = 'confirmed' where id = $1", [r.id]));
    expect((await orderOf(r.order_id)).status).toBe("placed");
  });

  it("refuses sold-out stock, foreign items, unserved zones, paused stores and bad totals", async () => {
    await expect(order({ user: alice, lines: [{ item: peda, qty: 99, price: 12_000 }] })).rejects.toThrow(/out_of_stock/);
    await expect(order({ user: alice, lines: [{ item: water, qty: 1, price: 2000 }] })).rejects.toThrow(
      /item_unavailable/,
    );
    await expect(order({ user: alice, zone: govardhan })).rejects.toThrow(/zone_not_served/);
    await db.query("update public.stores set accepting_orders = false where id = $1", [restaurant]);
    await expect(order({ user: alice })).rejects.toThrow(/store_closed/);
    await db.query("update public.stores set accepting_orders = true where id = $1", [restaurant]);
    await expect(order({ user: alice, store: pharmacy })).rejects.toThrow(/quote_invalid/);

    const p = payload({ user: alice });
    await expect(
      service((tx) =>
        tx.query("select public.create_order($1, $2, $3, $4)", [
          JSON.stringify({ ...p.booking, tax_paise: 1, total_paise: p.booking.total_paise + 1 }),
          JSON.stringify(p.items),
          JSON.stringify(p.order),
          JSON.stringify(p.orderItems),
        ]),
      ),
    ).rejects.toThrow(/totals_mismatch/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.create_order($1, $2, $3, $4)", [
          JSON.stringify(p.booking),
          JSON.stringify(p.items),
          JSON.stringify(p.order),
          JSON.stringify(p.orderItems),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("order fulfilment", () => {
  it("runs accept → prepare → ready → out for delivery → delivered with the OTP and completes the booking", async () => {
    const r = await order({ user: alice });
    const o = await orderOf(r.order_id);
    await expect(step(r.order_id, "delivered")).rejects.toThrow(/invalid_transition/);
    await step(r.order_id, "accepted");
    expect((await orderOf(r.order_id)).eta_at).not.toBeNull();
    await step(r.order_id, "preparing");
    await step(r.order_id, "ready");

    await expect(assign(r.order_id, otherVendorRider)).rejects.toThrow(/partner_unavailable/);
    await assign(r.order_id, platformRider);
    const assigned = await orderOf(r.order_id);
    expect(assigned.partner_name).toBe("Kishan");
    expect(assigned.partner_token).toMatch(/^[0-9a-f]{48}$/);

    await expect(step(r.order_id, "accepted", "partner")).rejects.toThrow(/invalid_transition/);
    await step(r.order_id, "out_for_delivery", "partner");
    await expect(step(r.order_id, "delivered", "partner", o.delivery_otp === "0000" ? "1111" : "0000")).rejects.toThrow(
      /otp_mismatch/,
    );
    await step(r.order_id, "delivered", "partner", o.delivery_otp);
    expect(await orderOf(r.order_id)).toMatchObject({ status: "delivered", booking_status: "completed" });

    const rate = (user: string, n: number) =>
      service((tx) => tx.query("select public.rate_order($1, $2, $3::smallint, 'Tasty')", [r.order_id, user, n]));
    await expect(rate(bob, 5)).rejects.toThrow(/not_found/);
    await rate(alice, 5);
    await expect(rate(alice, 4)).rejects.toThrow(/invalid_transition/);
  });

  it("returns the stock when the store rejects an order", async () => {
    const before = await stockOf(peda);
    const r = await order({ user: alice, lines: [{ item: peda, qty: 1, price: 12_000 }] });
    await step(r.order_id, "rejected");
    expect((await orderOf(r.order_id)).status).toBe("rejected");
    expect(await stockOf(peda)).toBe(before);
    // The server then cancels the booking; the order stays rejected and stock is not returned twice.
    await service((tx) => tx.query("update public.bookings set status = 'cancelled' where id = $1", [r.id]));
    expect((await orderOf(r.order_id)).status).toBe("rejected");
    expect(await stockOf(peda)).toBe(before);
  });

  it("refuses to assign a rider to an unpaid online order", async () => {
    const r = await order({ user: alice, mode: "full" });
    await expect(assign(r.order_id, platformRider)).rejects.toThrow(/invalid_transition/);
  });

  it("shows an order to its customer, store and rider but never the rider link token", async () => {
    const r = await order({ user: alice });
    await assign(r.order_id, platformRider);
    const read = (user: string) =>
      asUser(db, user, (tx) => tx.query("select id, partner_name from public.orders where id = $1", [r.order_id]));
    expect((await read(alice)).rows).toHaveLength(1);
    expect((await read(cook)).rows).toHaveLength(1);
    expect((await read(riderUser)).rows).toHaveLength(1);
    expect((await read(bob)).rows).toHaveLength(0);
    await expect(
      asUser(db, alice, (tx) => tx.query("select partner_token from public.orders where id = $1", [r.order_id])),
    ).rejects.toThrow(/permission denied/);
    const items = await asUser(db, alice, (tx) =>
      tx.query("select name from public.order_items where order_id = $1", [r.order_id]),
    );
    expect(items.rows).toHaveLength(1);
    const events = await asUser(db, cook, (tx) =>
      tx.query("select status::text from public.order_events where order_id = $1", [r.order_id]),
    );
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it("audits who assigned the rider", async () => {
    const r = await order({ user: alice });
    await assign(r.order_id, platformRider);
    const { rows } = await db.query<{ actor_id: string }>(
      "select actor_id from public.audit_logs where table_name = 'orders' and new_data->>'id' = $1 and new_data->>'partner_id' is not null order by id desc limit 1",
      [r.order_id],
    );
    expect(rows[0].actor_id).toBe(manager);
  });
});

describe("medicine", () => {
  const submit = (user: string, files: string[]) =>
    service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.submit_prescription($1) as id", [
        JSON.stringify({
          user_id: user,
          patient_name: "Kamla Devi",
          patient_age: 68,
          phone: "+919876543210",
          zone_id: vrindavan,
          address: { line1: "Room 12, Radha Kunj" },
          files,
        }),
      ]);
      return rows[0].id;
    });

  it("only takes prescription files from the customer's own folder", async () => {
    await expect(submit(alice, [`${bob}/rx.jpg`])).rejects.toThrow(/invalid_file/);
    const id = await submit(alice, [`${alice}/rx.jpg`]);
    const theirs = await asUser(db, bob, (tx) => tx.query("select id from public.prescriptions where id = $1", [id]));
    expect(theirs.rows).toHaveLength(0);
    const mine = await asUser(db, alice, (tx) => tx.query("select id from public.prescriptions where id = $1", [id]));
    expect(mine.rows).toHaveLength(1);
  });

  it("turns a reviewed prescription's quote into a medicine order, once", async () => {
    const rx = await submit(alice, [`${alice}/rx2.jpg`]);
    const quote = (
      await asUser(db, manager, (tx) =>
        tx.query<{ id: string }>(
          `insert into public.medicine_quotes (prescription_id, store_id, lines, delivery_fee_paise, valid_until)
           values ($1, $2, '[{"name": "Paracetamol 650", "pack": "15 tablets", "qty": 1, "unit_price_paise": 3000, "tax_bps": 1200}]', 0, now() + interval '1 day')
           returning id`,
          [rx, pharmacy],
        ),
      )
    ).rows[0].id;
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          "insert into public.medicine_quotes (prescription_id, store_id, lines, valid_until) values ($1, $2, '[{}]', now())",
          [rx, pharmacy],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const medicine = { store: pharmacy, prescription: rx, quote, lines: [] as Line[] };
    const p = payload({ user: alice, ...medicine });
    const lines = [
      {
        kind: "item",
        line_key: "item:0",
        description: "Paracetamol 650",
        quantity: 1,
        amount_paise: 3000,
        discount_paise: 0,
        tax_rate_bps: 0,
        tax_paise: 0,
      },
    ];
    const run = () =>
      service((tx) =>
        tx.query<{ r: { order_id: string } }>("select public.create_order($1, $2, $3, $4) as r", [
          JSON.stringify({ ...p.booking, code: `PSTMED${++codeSeq}`, subtotal_paise: 3000, total_paise: 3000 }),
          JSON.stringify(lines),
          JSON.stringify(p.order),
          JSON.stringify([{ name: "Paracetamol 650", quantity: 1, unit_price_paise: 3000, line_total_paise: 3000 }]),
        ]),
      );
    const r = (await run()).rows[0].r;
    const { rows } = await db.query<{ status: string; quote_status: string; service: string }>(
      `select p.status::text, q.status as quote_status, b.service::text
         from public.prescriptions p join public.medicine_quotes q on q.prescription_id = p.id
         join public.orders o on o.prescription_id = p.id join public.bookings b on b.id = o.booking_id
        where o.id = $1`,
      [r.order_id],
    );
    expect(rows[0]).toEqual({ status: "ordered", quote_status: "accepted", service: "medicine" });
    await expect(run()).rejects.toThrow(/quote_invalid/);
  });
});
