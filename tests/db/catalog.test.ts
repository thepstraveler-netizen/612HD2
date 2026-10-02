import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let customer: string;
let editor: string;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  customer = await createUser(db, "customer@example.com");
  editor = await createUser(db, "editor@example.com");
  await db.query("select public.grant_role_by_email('editor@example.com', 'manager')");
}, 60_000);

const count = async (
  sql: string,
  run: (fn: (tx: { query: PGlite["query"] }) => Promise<number>) => Promise<number>,
) => run(async (tx) => (await tx.query<{ n: number }>(sql)).rows[0].n);

describe("baseline content", () => {
  it("ships the 14 services, home sections and header navigation", async () => {
    const services = await db.query<{ n: number }>("select count(*)::int as n from public.services");
    const sections = await db.query<{ n: number }>(
      "select count(*)::int as n from public.cms_sections where page = 'home'",
    );
    const nav = await db.query<{ n: number }>(
      "select count(*)::int as n from public.navigation_links where menu = 'header'",
    );
    expect(services.rows[0].n).toBe(14);
    expect(sections.rows[0].n).toBe(9);
    expect(nav.rows[0].n).toBe(10);
  });

  it("is idempotent when the migration runs again", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(__dirname, "../../supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_content_baseline.sql"))!;
    await db.exec(readFileSync(join(dir, file), "utf8"));
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.navigation_links");
    expect(rows[0].n).toBe(13);
  });

  it("requires English for localized text", async () => {
    await expect(
      db.query(
        `insert into public.services (slug, kind, name, summary) values ('x', 'enquiry', '{"hi": "केवल हिंदी"}', '{"en": "s"}')`,
      ),
    ).rejects.toThrow(/services_name_check/);
  });
});

describe("public catalog RLS", () => {
  it("lets signed-out visitors read published services but not hidden ones", async () => {
    await db.query("update public.services set is_published = false where slug = 'ota-handling'");
    const visible = await count("select count(*)::int as n from public.services", (fn) => asAnon(db, fn));
    expect(visible).toBe(13);
    const staffVisible = await count("select count(*)::int as n from public.services", (fn) =>
      asUser(db, editor, fn),
    );
    expect(staffVisible).toBe(14);
    await db.query("update public.services set is_published = true where slug = 'ota-handling'");
  });

  it("hides expired and future banners from the public", async () => {
    await db.query(
      `insert into public.offers_banners (title, starts_at, ends_at) values
        ('{"en": "Expired"}', now() - interval '2 days', now() - interval '1 day'),
        ('{"en": "Future"}', now() + interval '1 day', null)`,
    );
    const titles = await asAnon(db, async (tx) =>
      (await tx.query<{ t: string }>("select title->>'en' as t from public.offers_banners")).rows.map(
        (r) => r.t,
      ),
    );
    expect(titles).not.toContain("Expired");
    expect(titles).not.toContain("Future");
    expect(titles).toContain("Kartik Maas Special");
  });

  it("keeps private settings away from the public", async () => {
    const keys = await asAnon(db, async (tx) =>
      (await tx.query<{ key: string }>("select key from public.settings order by key")).rows.map(
        (r) => r.key,
      ),
    );
    expect(keys).toEqual([
      "business.profile",
      "business.social",
      "delivery.defaults",
      "hotels.search_defaults",
      "tax.hotel_gst_slabs",
    ]);
  });
});

describe("CMS write RLS", () => {
  it("blocks customers from editing content", async () => {
    await asUser(db, customer, (tx) =>
      tx.query(`update public.services set name = '{"en": "Hacked"}' where slug = 'car'`),
    );
    const { rows } = await db.query<{ n: string }>(
      "select name->>'en' as n from public.services where slug = 'car'",
    );
    expect(rows[0].n).toBe("Car Pick & Drop");
  });

  it("lets cms.write editors edit content and audits it", async () => {
    await asUser(db, editor, (tx) =>
      tx.query(
        `update public.services set summary = '{"en": "Safe AC cabs", "hi": "सुरक्षित एसी कैब"}' where slug = 'car'`,
      ),
    );
    const { rows } = await db.query<{ actor_id: string; changed_fields: string[] }>(
      "select actor_id, changed_fields from public.audit_logs where table_name = 'services' order by id desc limit 1",
    );
    expect(rows[0].actor_id).toBe(editor);
    expect(rows[0].changed_fields).toContain("summary");
  });

  it("blocks managers from settings (settings.write is admin-only)", async () => {
    await expect(
      asUser(db, editor, (tx) =>
        tx.query(`insert into public.feature_flags (key, enabled) values ('evil.flag', true)`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("storage policies", () => {
  it("only cms editors upload to the media bucket", async () => {
    await expect(
      asUser(db, customer, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('media', 'x.png')"),
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, editor, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('media', 'services/car.webp')"),
    );
  });

  it("keeps prescriptions in the owner's own folder", async () => {
    await asUser(db, customer, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('prescriptions', $1)", [
        `${customer}/rx.pdf`,
      ]),
    );
    await expect(
      asUser(db, customer, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('prescriptions', $1)", [
          `${editor}/rx.pdf`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    const editorSees = await count(
      "select count(*)::int as n from storage.objects where bucket_id = 'prescriptions'",
      (fn) => asUser(db, editor, fn),
    );
    expect(editorSees).toBe(1); // managers hold medicine.read
  });
});
