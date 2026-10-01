import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let customer: string;
let otherCustomer: string;
let manager: string;
let superAdmin: string;

beforeAll(async () => {
  db = await createTestDb();
  customer = await createUser(db, "customer@example.com");
  otherCustomer = await createUser(db, "other@example.com");
  manager = await createUser(db, "manager@example.com");
  superAdmin = await createUser(db, "owner@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  await db.query("select public.grant_role_by_email('owner@example.com', 'super_admin')");
}, 60_000);

const roleId = async (key: string) =>
  (await db.query<{ id: string }>("select id from public.roles where key = $1", [key])).rows[0].id;

describe("signup trigger", () => {
  it("creates a profile and assigns the customer role", async () => {
    const { rows } = await db.query<{ email: string; role: string }>(
      `select p.email, r.key as role from public.profiles p
       join public.user_roles ur on ur.user_id = p.id
       join public.roles r on r.id = ur.role_id where p.id = $1`,
      [customer],
    );
    expect(rows).toEqual([{ email: "customer@example.com", role: "customer" }]);
  });
});

describe("has_permission()", () => {
  it("reflects the role matrix for the current user", async () => {
    const check = (user: string, key: string) =>
      asUser(db, user, async (tx) => {
        const { rows } = await tx.query<{ ok: boolean }>("select public.has_permission($1) as ok", [key]);
        return rows[0].ok;
      });
    expect(await check(customer, "hotels.read")).toBe(false);
    expect(await check(manager, "hotels.write")).toBe(true);
    expect(await check(manager, "payments.refund")).toBe(false);
    expect(await check(superAdmin, "users.manage_roles")).toBe(true);
  });
});

describe("profiles RLS", () => {
  it("lets a customer read only their own profile", async () => {
    const ids = await asUser(db, customer, async (tx) =>
      (await tx.query<{ id: string }>("select id from public.profiles")).rows.map((r) => r.id),
    );
    expect(ids).toEqual([customer]);
  });

  it("lets staff with customers.read see every profile", async () => {
    const count = await asUser(
      db,
      manager,
      async (tx) =>
        (await tx.query<{ n: number }>("select count(*)::int as n from public.profiles")).rows[0].n,
    );
    expect(count).toBe(4);
  });

  it("silently ignores updates to someone else's profile", async () => {
    await asUser(db, customer, (tx) =>
      tx.query("update public.profiles set full_name = 'hacked' where id = $1", [otherCustomer]),
    );
    const { rows } = await db.query<{ full_name: string | null }>(
      "select full_name from public.profiles where id = $1",
      [otherCustomer],
    );
    expect(rows[0].full_name).toBeNull();
  });

  it("blocks a customer from unblocking themselves", async () => {
    await expect(
      asUser(db, customer, (tx) =>
        tx.query("update public.profiles set is_blocked = true where id = $1", [customer]),
      ),
    ).rejects.toThrow(/insufficient privilege/);
  });
});

describe("user_roles RLS", () => {
  it("stops a customer from granting themselves admin", async () => {
    const adminRole = await roleId("admin");
    await expect(
      asUser(db, customer, (tx) =>
        tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [customer, adminRole]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("stops a non-super-admin from granting super_admin", async () => {
    await db.query("select public.grant_role_by_email('manager@example.com', 'admin')");
    const superRole = await roleId("super_admin");
    await expect(
      asUser(db, manager, (tx) =>
        tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [manager, superRole]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets a super admin grant roles", async () => {
    const agentRole = await roleId("agent");
    await asUser(db, superAdmin, (tx) =>
      tx.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [
        otherCustomer,
        agentRole,
      ]),
    );
    const { rows } = await db.query("select 1 from public.user_roles where user_id = $1 and role_id = $2", [
      otherCustomer,
      agentRole,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("audit_logs", () => {
  it("records who changed what, with before/after data", async () => {
    await asUser(db, customer, (tx) =>
      tx.query("update public.profiles set full_name = 'Radha Sharma' where id = $1", [customer]),
    );
    const { rows } = await db.query<{
      actor_id: string;
      action: string;
      changed_fields: string[];
      old_name: string | null;
      new_name: string;
    }>(
      `select actor_id, action, changed_fields, old_data->>'full_name' as old_name, new_data->>'full_name' as new_name
       from public.audit_logs where table_name = 'profiles' and record_id = $1 order by id desc limit 1`,
      [customer],
    );
    expect(rows[0]).toMatchObject({
      actor_id: customer,
      action: "UPDATE",
      old_name: null,
      new_name: "Radha Sharma",
    });
    expect(rows[0].changed_fields).toContain("full_name");
  });

  it("uses composite keys as record ids", async () => {
    const { rows } = await db.query<{ record_id: string }>(
      "select record_id from public.audit_logs where table_name = 'user_roles' order by id desc limit 1",
    );
    expect(rows[0].record_id).toMatch(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/);
  });

  it("is readable only with audit.read and never writable through the API", async () => {
    const customerSees = await asUser(
      db,
      customer,
      async (tx) =>
        (await tx.query<{ n: number }>("select count(*)::int as n from public.audit_logs")).rows[0].n,
    );
    expect(customerSees).toBe(0);
    const ownerSees = await asUser(
      db,
      superAdmin,
      async (tx) =>
        (await tx.query<{ n: number }>("select count(*)::int as n from public.audit_logs")).rows[0].n,
    );
    expect(ownerSees).toBeGreaterThan(0);
    await expect(asUser(db, superAdmin, (tx) => tx.query("delete from public.audit_logs"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("RLS coverage", () => {
  it("is enabled on every table in the public schema", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
