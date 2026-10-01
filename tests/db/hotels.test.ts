import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let customer: string;
let manager: string;
let agent: string;
let owner: string;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  customer = await createUser(db, "customer@example.com");
  manager = await createUser(db, "manager@example.com");
  agent = await createUser(db, "agent@example.com");
  owner = await createUser(db, "owner@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  await db.query("select public.grant_role_by_email('agent@example.com', 'agent')");
  // The draft demo hotel belongs to a vendor that `owner` is a member of.
  await db.query(`
    with v as (insert into public.vendors (kind, name, slug, status) values ('hotel', 'Demo Vendor', 'demo-vendor', 'active') returning id)
    update public.hotels set vendor_id = (select id from v) where slug = 'demo-draft-hotel'`);
  await db.query(
    `insert into public.vendor_members (vendor_id, user_id) select id, $1 from public.vendors where slug = 'demo-vendor'`,
    [owner],
  );
}, 60_000);

const slugs = async (run: <T>(fn: (tx: Pick<PGlite, "query">) => Promise<T>) => Promise<T>) =>
  run(async (tx) =>
    (await tx.query<{ slug: string }>("select slug from public.hotels order by slug")).rows.map(
      (r) => r.slug,
    ),
  );

describe("hotel baseline", () => {
  it("ships amenities, GST slabs, search defaults and the featured-hotels section", async () => {
    const { rows } = await db.query<{ amenities: number; gst: unknown; section: string }>(`
      select (select count(*)::int from public.amenities) as amenities,
             (select value from public.settings where key = 'tax.hotel_gst_slabs') as gst,
             (select type::text from public.cms_sections where key = 'featured-hotels') as section`);
    expect(rows[0].amenities).toBeGreaterThanOrEqual(16);
    expect(rows[0].gst).toEqual([
      { max_tariff_paise: 100000, rate_bps: 0 },
      { max_tariff_paise: 750000, rate_bps: 500 },
      { max_tariff_paise: null, rate_bps: 1800 },
    ]);
    expect(rows[0].section).toBe("featured_hotels");
  });

  it("points the header Hotels link at the listing", async () => {
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.navigation_links where menu = 'header' and href = '/hotels'",
    );
    expect(rows[0].n).toBe(1);
  });

  it("seeds six published demo hotels and one draft", async () => {
    const { rows } = await db.query<{ status: string; n: number }>(
      "select status::text, count(*)::int as n from public.hotels group by status order by status",
    );
    expect(rows).toEqual([
      { status: "draft", n: 1 },
      { status: "published", n: 6 },
    ]);
  });
});

describe("hotel RLS", () => {
  it("shows only published hotels and their rooms to the public", async () => {
    const visible = await slugs((fn) => asAnon(db, fn));
    expect(visible).toHaveLength(6);
    expect(visible).not.toContain("demo-draft-hotel");
    const rooms = await asAnon(db, async (tx) => {
      await tx.query("select count(*) from public.hotel_rate_plans");
      return (await tx.query<{ n: number }>("select count(*)::int as n from public.hotel_rooms")).rows[0].n;
    });
    expect(rooms).toBe(9);
  });

  it("lets staff with hotels.read and vendor members see drafts", async () => {
    expect(await slugs((fn) => asUser(db, agent, fn))).toContain("demo-draft-hotel");
    expect(await slugs((fn) => asUser(db, owner, fn))).toContain("demo-draft-hotel");
    expect(await slugs((fn) => asUser(db, customer, fn))).not.toContain("demo-draft-hotel");
  });

  it("hides a hotel's rooms, plans and calendar once it is unpublished", async () => {
    await db.query("update public.hotels set status = 'archived' where slug = 'demo-janmabhoomi-inn'");
    const counts = await asAnon(db, async (tx) => {
      const q = async (sql: string) => (await tx.query<{ n: number }>(sql)).rows[0].n;
      return {
        rooms: await q(
          "select count(*)::int as n from public.hotel_rooms r join public.hotels h on h.id = r.hotel_id where h.slug = 'demo-janmabhoomi-inn'",
        ),
        inventory: await q("select count(*)::int as n from public.hotel_inventory where sold_units > 0"),
      };
    });
    expect(counts).toEqual({ rooms: 0, inventory: 0 });
    await db.query("update public.hotels set status = 'published' where slug = 'demo-janmabhoomi-inn'");
  });

  it("allows writes only with hotels.write", async () => {
    const rename = (tx: Pick<PGlite, "query">) =>
      tx.query(`update public.hotels set star_rating = 5 where slug = 'demo-braj-homestay' returning id`);
    expect((await asUser(db, agent, rename)).rows).toHaveLength(0); // agent: hotels.read only
    expect((await asUser(db, owner, rename)).rows).toHaveLength(0); // vendor writes arrive in phase 9
    await expect(
      asAnon(db, (tx) =>
        tx.query(
          `insert into public.hotel_rates (rate_plan_id, date, price_paise) select id, '2026-12-01', 1 from public.hotel_rate_plans limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
    expect((await asUser(db, manager, rename)).rows).toHaveLength(1);
  });

  it("audits hotel changes", async () => {
    await asUser(db, manager, (tx) =>
      tx.query(
        "update public.hotel_rate_plans set base_price_paise = base_price_paise + 100 where meal_plan = 'full_board'",
      ),
    );
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.audit_logs where table_name = 'hotel_rate_plans' and action = 'UPDATE'",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("rejects inconsistent occupancy and pricing rules", async () => {
    await expect(
      db.query(
        `insert into public.hotel_rooms (hotel_id, name, base_occupancy, max_adults, max_occupancy) select id, '{"en": "Bad"}', 3, 2, 4 from public.hotels limit 1`,
      ),
    ).rejects.toThrow(/check/);
    await expect(
      db.query(
        `insert into public.hotel_pricing_rules (hotel_id, name, start_date, end_date, weekdays, adjustment, value) select id, 'Bad', '2026-01-01', '2026-01-02', '{8}', 'percent', 1 from public.hotels limit 1`,
      ),
    ).rejects.toThrow(/check/);
  });
});
