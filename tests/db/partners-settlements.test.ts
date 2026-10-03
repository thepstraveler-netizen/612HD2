import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let applicant: string;
let other: string;
let admin: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

function application(user: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: user,
    business_type: "hotel",
    business_name: "Shri Radha Residency",
    contact_name: "Radha Kant",
    phone: "+919812345678",
    email: "radha@example.com",
    city: "Vrindavan",
    address: "Near Prem Mandir, Chhatikara Road",
    gstin: "09ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    details: { rooms: 24 },
    documents: [
      {
        kind: "id_proof",
        path: `partners/${user}/a.pdf`,
        name: "aadhaar.pdf",
        mime_type: "application/pdf",
        size: 1200,
      },
      { kind: "pan", path: `partners/${user}/b.jpg`, name: "pan.jpg", mime_type: "image/jpeg", size: 800 },
    ],
    agreement_version: "2026-10",
    agreement_name: "Radha Kant",
    ...extra,
  };
}

async function submit(user: string, extra: Record<string, unknown> = {}) {
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; number: number } }>(
      "select public.submit_partner_application($1) as r",
      [JSON.stringify(application(user, extra))],
    );
    return rows[0].r;
  });
}

async function newVendor(bps = 1000): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vendors (kind, name, slug, commission_bps, status)
     values ('hotel', 'Ledger Test', 'ledger-test-' || $1, $2, 'active') returning id`,
    [++codeSeq, bps],
  );
  return rows[0].id;
}

/** A confirmed booking for the vendor: total, paid now, payment mode. */
async function confirmedBooking(vendor: string, total: number, paid: number, mode = "part"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.bookings (code, service, status, vendor_id, contact_name, contact_phone, subtotal_paise,
       tax_paise, total_paise, payable_now_paise, paid_paise, payment_mode, price_breakdown, confirmed_at)
     values ($1, 'travel', 'confirmed', $2, 'Ledger Guest', '+919876543210', $3, 0, $3, $4, $4, $5, '{}', now())
     returning id`,
    [`PSTLDG${String(++codeSeq).padStart(4, "0")}`, vendor, total, paid, mode],
  );
  return rows[0].id;
}

async function complete(booking: string) {
  await service((tx) => tx.query("select public.complete_booking($1, $2)", [booking, admin]));
}

async function entries(vendor: string) {
  const { rows } = await db.query<{
    kind: string;
    gross_paise: number;
    platform_collected_paise: number;
    vendor_collected_paise: number;
    commission_paise: number;
    commission_tax_paise: number;
    net_paise: number;
    payout_id: string | null;
  }>(
    `select kind, gross_paise, platform_collected_paise, vendor_collected_paise, commission_paise,
            commission_tax_paise, net_paise, payout_id
       from public.vendor_ledger_entries where vendor_id = $1 order by created_at, id`,
    [vendor],
  );
  return rows;
}

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
  applicant = await createUser(db, "applicant@example.com");
  other = await createUser(db, "other@example.com");
  admin = await createUser(db, "admin@example.com");
  await db.query("select public.grant_role_by_email('admin@example.com', 'admin')");
}, 60_000);

describe("service plans and portfolio", () => {
  it("shows published plans to everyone and hides drafts", async () => {
    await db.query(
      `update public.service_plans set is_published = false
        where service_id = (select id from public.services where slug = 'hotel-photography') and sort_order = 1`,
    );
    const names = await asAnon(db, async (tx) =>
      (
        await tx.query<{ n: string }>(
          `select p.name->>'en' as n from public.service_plans p
             join public.services s on s.id = p.service_id where s.slug = 'hotel-photography'`,
        )
      ).rows.map((r) => r.n),
    );
    expect(names).toEqual(["Listing booster"]);
  });

  it("lets only CMS editors change plans", async () => {
    await asUser(db, other, (tx) => tx.query("update public.service_plans set price_paise = 1"));
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.service_plans where price_paise = 1",
    );
    expect(rows[0].n).toBe("0");
    await asUser(db, admin, (tx) =>
      tx.query(`update public.service_plans set price_paise = 1 where name->>'en' = 'Booking desk'`),
    );
    const after = await db.query<{ n: string }>(
      "select count(*)::text as n from public.service_plans where price_paise = 1",
    );
    expect(after.rows[0].n).toBe("1");
  });

  it("needs an image or a link on a portfolio item", async () => {
    const message = await errorOf(() =>
      db.query(
        `insert into public.service_portfolio (service_id, title)
         select id, '{"en": "Empty"}' from public.services where slug = 'hotel-photography'`,
      ),
    );
    expect(message).toMatch(/check constraint/);
  });
});

describe("partner applications", () => {
  let appId: string;

  it("records an application and allows only one open application per person", async () => {
    const created = await submit(applicant);
    appId = created.id;
    expect(created.number).toBeGreaterThan(0);
    expect(await errorOf(() => submit(applicant))).toBe("application_open");
  });

  it("is not callable by signed-in users directly", async () => {
    const message = await errorOf(() =>
      asUser(db, other, (tx) =>
        tx.query("select public.submit_partner_application($1)", [JSON.stringify(application(other))]),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("shows applicants only their own application", async () => {
    const mine = await asUser(
      db,
      applicant,
      async (tx) => (await tx.query("select id from public.partner_applications")).rows.length,
    );
    const theirs = await asUser(
      db,
      other,
      async (tx) => (await tx.query("select id from public.partner_applications")).rows.length,
    );
    expect(mine).toBe(1);
    expect(theirs).toBe(0);
  });

  it("needs a reason to reject and refuses impossible moves", async () => {
    expect(
      await errorOf(() =>
        service((tx) =>
          tx.query("select public.review_partner_application($1, 'rejected', '', $2)", [appId, admin]),
        ),
      ),
    ).toBe("reason_required");
    await service((tx) =>
      tx.query("select public.review_partner_application($1, 'under_review', null, $2)", [appId, admin]),
    );
    expect(
      await errorOf(() =>
        service((tx) =>
          tx.query("select public.review_partner_application($1, 'under_review', null, $2)", [appId, admin]),
        ),
      ),
    ).toBe("invalid_transition");
  });

  it("approves into an active vendor owned by the applicant, with the vendor role and documents", async () => {
    const vendorId = await service(async (tx) => {
      const { rows } = await tx.query<{ v: string }>(
        "select public.approve_partner_application($1, null, $2) as v",
        [appId, admin],
      );
      return rows[0].v;
    });
    const { rows: vendor } = await db.query<{
      kind: string;
      slug: string;
      status: string;
      commission_bps: number;
    }>("select kind, slug, status, commission_bps from public.vendors where id = $1", [vendorId]);
    expect(vendor[0]).toEqual({
      kind: "hotel",
      slug: "shri-radha-residency",
      status: "active",
      commission_bps: 1500,
    });
    const { rows: member } = await db.query(
      "select role from public.vendor_members where vendor_id = $1 and user_id = $2",
      [vendorId, applicant],
    );
    expect(member).toEqual([{ role: "owner" }]);
    const { rows: roles } = await db.query<{ key: string }>(
      "select r.key from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1",
      [applicant],
    );
    expect(roles.map((r) => r.key)).toContain("vendor");
    const { rows: docs } = await db.query<{ kind: string; status: string }>(
      "select kind, status from public.vendor_documents where vendor_id = $1 order by kind",
      [vendorId],
    );
    expect(docs).toEqual([
      { kind: "id_proof", status: "verified" },
      { kind: "pan", status: "verified" },
    ]);
    // The new owner sees their documents; nobody else does.
    const seen = await asUser(
      db,
      applicant,
      async (tx) =>
        (await tx.query("select id from public.vendor_documents where vendor_id = $1", [vendorId])).rows
          .length,
    );
    const hidden = await asUser(
      db,
      other,
      async (tx) =>
        (await tx.query("select id from public.vendor_documents where vendor_id = $1", [vendorId])).rows
          .length,
    );
    expect(seen).toBe(2);
    expect(hidden).toBe(0);
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.approve_partner_application($1, null, $2)", [appId, admin])),
      ),
    ).toBe("invalid_transition");
  });

  it("gives a second business with the same name its own slug", async () => {
    const second = await submit(other, { business_name: "Shri Radha Residency", documents: [] });
    const vendorId = await service(async (tx) => {
      const { rows } = await tx.query<{ v: string }>(
        "select public.approve_partner_application($1, 1200, $2) as v",
        [second.id, admin],
      );
      return rows[0].v;
    });
    const { rows } = await db.query<{ slug: string; commission_bps: number }>(
      "select slug, commission_bps from public.vendors where id = $1",
      [vendorId],
    );
    expect(rows[0]).toEqual({ slug: "shri-radha-residency-2", commission_bps: 1200 });
  });
});

describe("vendor settlement ledger", () => {
  it("writes nothing until the booking completes", async () => {
    const vendor = await newVendor();
    await confirmedBooking(vendor, 1_000_000, 250_000);
    expect(await entries(vendor)).toEqual([]);
  });

  it("splits a completed booking into collected money, commission, GST on commission and net", async () => {
    const vendor = await newVendor(1000);
    const booking = await confirmedBooking(vendor, 1_000_000, 250_000);
    await complete(booking);
    expect(await entries(vendor)).toEqual([
      {
        kind: "booking",
        gross_paise: 1_000_000,
        platform_collected_paise: 250_000,
        vendor_collected_paise: 750_000,
        commission_paise: 100_000,
        commission_tax_paise: 18_000,
        net_paise: 132_000,
        payout_id: null,
      },
    ]);
  });

  it("goes negative when the vendor collected everything (pay at hotel)", async () => {
    const vendor = await newVendor(1000);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.bookings (code, service, status, vendor_id, contact_name, contact_phone, subtotal_paise,
         tax_paise, total_paise, payable_now_paise, payment_mode, price_breakdown, confirmed_at)
       values ('PSTPAH0001', 'travel', 'confirmed', $1, 'Hotel Guest', '+919876543210', 500000, 0, 500000, 0,
         'pay_at_hotel', '{}', now()) returning id`,
      [vendor],
    );
    await complete(rows[0].id);
    const [entry] = await entries(vendor);
    expect(entry.net_paise).toBe(-59_000);
    expect(entry.vendor_collected_paise).toBe(500_000);
  });

  it("follows a refund before the payout, and adds an adjustment after it", async () => {
    const vendor = await newVendor(1000);
    const booking = await confirmedBooking(vendor, 1_000_000, 1_000_000, "full");
    await complete(booking);
    await db.query("update public.bookings set refunded_paise = 200000 where id = $1", [booking]);
    let rows = await entries(vendor);
    expect(rows).toHaveLength(1);
    expect(rows[0].gross_paise).toBe(800_000);
    expect(rows[0].net_paise).toBe(800_000 - 80_000 - 14_400);

    const payout = await service(async (tx) => {
      const { rows } = await tx.query<{ p: { id: string; amount_paise: string; entries_count: number } }>(
        "select to_jsonb(public.create_vendor_payout($1, (now() at time zone 'Asia/Kolkata')::date, $2)) as p",
        [vendor, admin],
      );
      return rows[0].p;
    });
    expect(Number(payout.amount_paise)).toBe(705_600);
    expect(payout.entries_count).toBe(1);

    await db.query("update public.bookings set refunded_paise = 300000 where id = $1", [booking]);
    rows = await entries(vendor);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "adjustment",
      gross_paise: -100_000,
      commission_paise: -10_000,
      commission_tax_paise: -1_800,
      net_paise: -88_200,
      payout_id: null,
    });
  });

  it("allows one pending payout per vendor, then pays or cancels it", async () => {
    const vendor = await newVendor(1000);
    await complete(await confirmedBooking(vendor, 400_000, 400_000, "full"));
    expect(
      await errorOf(() =>
        service((tx) =>
          tx.query("select public.create_vendor_payout($1, current_date - 30, $2)", [vendor, admin]),
        ),
      ),
    ).toBe("nothing_to_settle");
    const payoutId = await service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select (public.create_vendor_payout($1, (now() at time zone 'Asia/Kolkata')::date, $2)).id",
        [vendor, admin],
      );
      return rows[0].id;
    });
    expect(
      await errorOf(() =>
        service((tx) =>
          tx.query("select public.create_vendor_payout($1, (now() at time zone 'Asia/Kolkata')::date, $2)", [
            vendor,
            admin,
          ]),
        ),
      ),
    ).toBe("payout_pending");

    await service((tx) => tx.query("select public.cancel_vendor_payout($1, $2)", [payoutId, admin]));
    expect((await entries(vendor))[0].payout_id).toBeNull();

    const again = await service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select (public.create_vendor_payout($1, (now() at time zone 'Asia/Kolkata')::date, $2)).id",
        [vendor, admin],
      );
      return rows[0].id;
    });
    await service((tx) =>
      tx.query("select public.mark_vendor_payout_paid($1, 'upi', 'UTR123', null, $2)", [again, admin]),
    );
    const { rows } = await db.query<{ status: string; reference: string }>(
      "select status, reference from public.vendor_payouts where id = $1",
      [again],
    );
    expect(rows[0]).toEqual({ status: "paid", reference: "UTR123" });
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.cancel_vendor_payout($1, $2)", [again, admin])),
      ),
    ).toBe("invalid_transition");
  });

  it("records manual adjustments with a reason", async () => {
    const vendor = await newVendor();
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.add_vendor_adjustment($1, 5000, '', $2)", [vendor, admin])),
      ),
    ).toBe("reason_required");
    await service((tx) =>
      tx.query("select public.add_vendor_adjustment($1, -5000, 'Damaged linen', $2)", [vendor, admin]),
    );
    expect((await entries(vendor))[0]).toMatchObject({ kind: "manual", net_paise: -5000, gross_paise: 0 });
  });

  it("settles a cab trip with the vendor of the assigned vehicle", async () => {
    const vendor = await newVendor(1000);
    const booking = await confirmedBooking(vendor, 300_000, 300_000, "full");
    // Detach the booking's own vendor so the trip's vehicle decides.
    await db.query("update public.bookings set vendor_id = null where id = $1", [booking]);
    const { rows: vehicle } = await db.query<{ id: string }>(
      `insert into public.vehicles (category_id, registration_no, fuel, vendor_id)
       select id, 'UP85 AB 1234', 'cng', $1 from public.cab_categories limit 1 returning id`,
      [vendor],
    );
    const { rows } = await db.query<{ v: string | null }>(
      "select public.booking_settlement_vendor($1) as v",
      [booking],
    );
    expect(rows[0].v).toBeNull();
    await db.query(
      `insert into public.trips (booking_id, trip_type, category_id, pickup_place_id, pickup_address, pickup_at,
         passengers, vehicle_id)
       select $1, 'local', c.id, p.id, 'Banke Bihari Temple', now(), 2, $2
         from public.cab_categories c, public.cab_places p limit 1`,
      [booking, vehicle[0].id],
    );
    const { rows: after } = await db.query<{ v: string | null }>(
      "select public.booking_settlement_vendor($1) as v",
      [booking],
    );
    expect(after[0].v).toBe(vendor);
  });

  it("shows vendors only their own ledger and payouts", async () => {
    const vendor = await newVendor();
    await complete(await confirmedBooking(vendor, 200_000, 200_000, "full"));
    await db.query("insert into public.vendor_members (vendor_id, user_id) values ($1, $2)", [vendor, other]);
    const own = await asUser(
      db,
      other,
      async (tx) =>
        (await tx.query("select id from public.vendor_ledger_entries where vendor_id = $1", [vendor])).rows
          .length,
    );
    const all = await asUser(
      db,
      other,
      async (tx) =>
        (await tx.query("select distinct vendor_id from public.vendor_ledger_entries")).rows.length,
    );
    expect(own).toBe(1);
    expect(all).toBe(1);
    const anon = await asAnon(
      db,
      async (tx) => (await tx.query("select id from public.vendor_ledger_entries")).rows.length,
    );
    expect(anon).toBe(0);
  });
});

describe("vendor self-service", () => {
  it("lets members update their own business details and add documents, nobody else", async () => {
    const vendor = await newVendor();
    await db.query("insert into public.vendor_members (vendor_id, user_id) values ($1, $2)", [
      vendor,
      applicant,
    ]);
    const profile = {
      contact_name: "Radha Kant",
      phone: "+919812345678",
      email: "radha@example.com",
      address: "Chhatikara Road, Vrindavan",
      city: "Vrindavan",
      gstin: "",
      pan: "ABCDE1234F",
      bank_details: {
        holder: "Radha Kant",
        account_number: "1234567890",
        ifsc: "SBIN0001234",
        bank: "SBI",
        upi_id: "",
      },
    };
    await service((tx) =>
      tx.query("select public.update_vendor_profile($1, $2, $3)", [
        vendor,
        JSON.stringify(profile),
        applicant,
      ]),
    );
    const { rows } = await db.query<{ pan: string; gstin: string | null; city: string }>(
      "select pan, gstin, city from public.vendors where id = $1",
      [vendor],
    );
    expect(rows[0]).toEqual({ pan: "ABCDE1234F", gstin: null, city: "Vrindavan" });
    expect(
      await errorOf(() =>
        service((tx) =>
          tx.query("select public.update_vendor_profile($1, $2, $3)", [
            vendor,
            JSON.stringify(profile),
            admin,
          ]),
        ),
      ),
    ).toBe("not_member");

    const doc = {
      kind: "fssai",
      path: `vendors/${vendor}/x.pdf`,
      name: "fssai.pdf",
      mime_type: "application/pdf",
      size: 10,
    };
    await service((tx) =>
      tx.query("select public.add_vendor_document($1, $2, $3)", [vendor, JSON.stringify(doc), applicant]),
    );
    const { rows: docs } = await db.query<{ status: string }>(
      "select status from public.vendor_documents where vendor_id = $1",
      [vendor],
    );
    expect(docs).toEqual([{ status: "pending" }]);
  });
});

describe("cash on delivery", () => {
  it("counts cash brought in by a platform rider as collected by the platform", async () => {
    const vendor = await newVendor(1000);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.bookings (code, service, status, vendor_id, contact_name, contact_phone, subtotal_paise,
         tax_paise, total_paise, payable_now_paise, payment_mode, price_breakdown, confirmed_at)
       values ('PSTCOD0001', 'food', 'confirmed', $1, 'Food Guest', '+919876543210', 50000, 0, 50000, 0,
         'pay_at_hotel', '{}', now()) returning id`,
      [vendor],
    );
    const booking = rows[0].id;
    const { rows: store } = await db.query<{ id: string; zone: string }>(
      `select s.id, z.id as zone from public.stores s, public.delivery_zones z limit 1`,
    );
    const { rows: rider } = await db.query<{ id: string }>(
      "select id from public.delivery_partners where vendor_id is null limit 1",
    );
    await db.query(
      `insert into public.orders (booking_id, store_id, vendor_id, kind, zone_id, address, partner_id, delivery_otp)
       select $1, s.id, $2, s.kind, $3, '{"line1": "Gali 1", "area": "Raman Reti"}', $4, '1234'
         from public.stores s where s.id = $5`,
      [booking, vendor, store[0].zone, rider[0].id, store[0].id],
    );
    await complete(booking);
    const [entry] = await entries(vendor);
    expect(entry.platform_collected_paise).toBe(50_000);
    expect(entry.net_paise).toBe(50_000 - 5_000 - 900);
  });
});
