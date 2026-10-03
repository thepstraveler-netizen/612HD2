import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let priya: string;
let ravi: string;
let admin: string;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "no error";
  } catch (error) {
    return (error as Error).message;
  }
}

async function hit(bucket: string, limit = 2, windowSeconds = 600) {
  return service(async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean; hits: number; retry_after: number }>(
      "select * from public.hit_rate_limit($1, $2, $3)",
      [bucket, limit, windowSeconds],
    );
    return rows[0];
  });
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  priya = await createUser(db, "priya@example.com");
  ravi = await createUser(db, "ravi@example.com");
  admin = await createUser(db, "admin@example.com");
  await db.query("select public.grant_role_by_email('admin@example.com', 'admin')");
}, 60_000);

describe("rate limits", () => {
  it("allows up to the limit in a window, then blocks with a retry time", async () => {
    expect(await hit("enquiry:ip:203.0.113.7")).toMatchObject({ allowed: true, hits: 1, retry_after: 0 });
    expect(await hit("enquiry:ip:203.0.113.7")).toMatchObject({ allowed: true, hits: 2 });
    const blocked = await hit("enquiry:ip:203.0.113.7");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after).toBeGreaterThan(0);
    expect(blocked.retry_after).toBeLessThanOrEqual(600);
    // Other buckets are counted separately.
    expect((await hit("enquiry:ip:203.0.113.8")).allowed).toBe(true);
  });

  it("purges old windows and is closed to API roles", async () => {
    await db.query(
      "insert into public.rate_limit_hits (bucket, window_start, hits) values ('old:bucket', now() - interval '2 days', 9)",
    );
    const purged = await service((tx) => tx.query<{ n: number }>("select public.purge_rate_limits() as n"));
    expect(purged.rows[0].n).toBe(1);

    expect(
      await errorOf(() => asAnon(db, (tx) => tx.query("select * from public.hit_rate_limit('x:y:z', 1, 60)"))),
    ).toContain("permission denied");
    const seen = await asUser(db, priya, (tx) =>
      tx.query<{ n: number }>("select count(*)::int as n from public.rate_limit_hits"),
    );
    expect(seen.rows[0].n).toBe(0);
  });

  it("ships admin-editable limits that stay private", async () => {
    const { rows } = await db.query<{ value: { rate_limits: Record<string, { limit: number }> }; is_public: boolean }>(
      "select value, is_public from public.settings where key = 'security.defaults'",
    );
    expect(rows[0].is_public).toBe(false);
    expect(Object.keys(rows[0].value.rate_limits)).toEqual(
      expect.arrayContaining(["auth", "enquiry", "coupon", "partner", "review", "upload", "export"]),
    );
  });
});

describe("privacy requests", () => {
  it("records one pending deletion per account, visible to its owner and staff only", async () => {
    const id = await service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.request_account_deletion($1, $2) as id", [
        priya,
        "Moving abroad",
      ]);
      return rows[0].id;
    });
    expect(
      await errorOf(() => service((tx) => tx.query("select public.request_account_deletion($1, null)", [priya]))),
    ).toContain("already_requested");

    const own = await asUser(db, priya, (tx) =>
      tx.query<{ id: string; email: string }>("select id, email::text from public.privacy_requests"),
    );
    expect(own.rows).toEqual([{ id, email: "priya@example.com" }]);
    const other = await asUser(db, ravi, (tx) => tx.query("select id from public.privacy_requests"));
    expect(other.rows).toHaveLength(0);
    const staff = await asUser(db, admin, (tx) => tx.query("select id from public.privacy_requests"));
    expect(staff.rows.map((r) => (r as { id: string }).id)).toContain(id);

    // Customers cannot write the table directly.
    expect(
      await errorOf(() =>
        asUser(db, ravi, (tx) =>
          tx.query("insert into public.privacy_requests (user_id, kind) values ($1, 'delete')", [ravi]),
        ),
      ),
    ).toMatch(/permission denied|row-level security/);
  });

  it("lets the customer cancel, and staff reject only with a reason", async () => {
    const cancelled = await service((tx) =>
      tx.query<{ ok: boolean }>("select public.cancel_account_deletion($1) as ok", [priya]),
    );
    expect(cancelled.rows[0].ok).toBe(true);

    const id = await service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.request_account_deletion($1, null) as id", [ravi]);
      return rows[0].id;
    });
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.resolve_privacy_request($1, $2, 'rejected', '')", [admin, id])),
      ),
    ).toContain("reason_required");
    await service((tx) =>
      tx.query("select public.resolve_privacy_request($1, $2, 'rejected', 'Open booking next week')", [admin, id]),
    );
    const { rows } = await db.query<{ status: string; processed_by: string }>(
      "select status, processed_by from public.privacy_requests where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ status: "rejected", processed_by: admin });
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.resolve_privacy_request($1, $2, 'completed', null)", [admin, id])),
      ),
    ).toContain("not_found");
  });

  it("logs exports and counts bookings that block deletion", async () => {
    await service((tx) => tx.query("select public.log_data_export($1)", [ravi]));
    const { rows } = await db.query<{ status: string }>(
      "select status from public.privacy_requests where user_id = $1 and kind = 'export'",
      [ravi],
    );
    expect(rows).toEqual([{ status: "completed" }]);

    await db.query(
      `insert into public.bookings (code, user_id, service, status, contact_name, contact_phone, subtotal_paise,
         tax_paise, total_paise, payable_now_paise, paid_paise, payment_mode, price_breakdown, confirmed_at)
       values ('PSTPRV0001', $1, 'travel', 'confirmed', 'Ravi', '+919876543210', 100, 0, 100, 100, 100, 'full', '{}', now())`,
      [ravi],
    );
    const blockers = await service((tx) =>
      tx.query<{ n: number }>("select public.account_deletion_blockers($1) as n", [ravi]),
    );
    expect(blockers.rows[0].n).toBe(1);
  });

  it("keeps bookings but drops the link when the account is deleted", async () => {
    const id = await service(async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.request_account_deletion($1, null) as id", [ravi]);
      return rows[0].id;
    });
    await db.query("delete from auth.users where id = $1", [ravi]);
    const booking = await db.query<{ user_id: string | null }>(
      "select user_id from public.bookings where code = 'PSTPRV0001'",
    );
    expect(booking.rows[0].user_id).toBeNull();
    const request = await db.query<{ user_id: string | null; email: string }>(
      "select user_id, email::text from public.privacy_requests where id = $1",
      [id],
    );
    expect(request.rows[0]).toEqual({ user_id: null, email: "ravi@example.com" });
    await service((tx) => tx.query("select public.resolve_privacy_request($1, $2, 'completed', null)", [admin, id]));
  });
});
