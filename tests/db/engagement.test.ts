import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let priya: string;
let ravi: string;
let admin: string;
let codeSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);
const today = "(now() at time zone 'Asia/Kolkata')::date";

async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "no error";
  } catch (error) {
    return (error as Error).message;
  }
}

/** A confirmed, fully paid travel booking for the user. */
async function booking(user: string, total = 1_000_00, extra: Record<string, string> = {}): Promise<string> {
  const cols = Object.keys(extra);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.bookings (code, user_id, service, status, contact_name, contact_phone, subtotal_paise,
       tax_paise, total_paise, payable_now_paise, paid_paise, payment_mode, price_breakdown, confirmed_at
       ${cols.map((c) => `, ${c}`).join("")})
     values ($1, $2, ${extra.hotel_id ? "'hotel'" : "'travel'"}, 'confirmed', 'Priya Sharma', '+919876543210', $3, 0,
       $3, $3, $3, 'full', '{}', now() ${cols.map((c) => `, ${extra[c]}`).join("")})
     returning id`,
    [`PSTENG${String(++codeSeq).padStart(4, "0")}`, user, total],
  );
  return rows[0].id;
}

async function complete(id: string) {
  await service((tx) => tx.query("select public.complete_booking($1, $2)", [id, admin]));
}

async function review(user: string, bookingId: string, extra: Record<string, unknown> = {}) {
  return service(async (tx) => {
    const { rows } = await tx.query<{
      r: { id: string; status: string; author_name: string; subject_type: string };
    }>("select to_jsonb(public.submit_review($1)) as r", [
      JSON.stringify({
        user_id: user,
        booking_id: bookingId,
        rating: 4,
        title: "Lovely",
        body: "Clean rooms",
        ...extra,
      }),
    ]);
    return rows[0].r;
  });
}

async function balance(user: string): Promise<number> {
  const { rows } = await db.query<{ b: number }>("select public.loyalty_balance($1) as b", [user]);
  return rows[0].b;
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  priya = await createUser(db, "priya@example.com");
  ravi = await createUser(db, "ravi@example.com");
  admin = await createUser(db, "admin@example.com");
  await db.query("select public.grant_role_by_email('admin@example.com', 'admin')");
}, 60_000);

describe("reviews", () => {
  it("lets the customer review a completed booking once, held for moderation", async () => {
    const id = await booking(priya);
    expect(await errorOf(() => review(priya, id))).toContain("not_eligible");
    await complete(id);
    expect(await errorOf(() => review(ravi, id))).toContain("not_eligible");

    const r = await review(priya, id);
    expect(r).toMatchObject({ status: "pending", author_name: "Priya S.", subject_type: "service" });
    expect(await errorOf(() => review(priya, id))).toContain("not_eligible");

    const seen = await asAnon(
      db,
      async (tx) => (await tx.query("select id from public.reviews where id = $1", [r.id])).rows,
    );
    expect(seen).toHaveLength(0);
    const own = await asUser(
      db,
      priya,
      async (tx) => (await tx.query("select id from public.reviews where id = $1", [r.id])).rows,
    );
    expect(own).toHaveLength(1);
  });

  it("publishes after moderation, hides who wrote it and needs a reason to reject", async () => {
    const id = await booking(priya);
    await complete(id);
    const r = await review(priya, id, { rating: 5 });
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.moderate_review($1, 'rejected', '', $2)", [r.id, admin])),
      ),
    ).toContain("reason_required");
    await service((tx) =>
      tx.query("select public.moderate_review($1, 'published', null, $2)", [r.id, admin]),
    );
    await service((tx) => tx.query("select public.reply_review($1, 'Thank you!', $2)", [r.id, admin]));

    const rows = await asAnon(
      db,
      async (tx) =>
        (
          await tx.query<{ rating: number; reply: string }>(
            "select rating, reply from public.reviews where id = $1",
            [r.id],
          )
        ).rows,
    );
    expect(rows).toEqual([{ rating: 5, reply: "Thank you!" }]);
    expect(
      await errorOf(() =>
        asAnon(db, (tx) => tx.query("select user_id from public.reviews where id = $1", [r.id])),
      ),
    ).toContain("permission denied");
  });

  it("allows a stay to be reviewed after checkout and keeps the hotel rating in step", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.hotels order by slug limit 1");
    const hotel = rows[0].id;
    const id = await booking(priya, 2_000_00, {
      hotel_id: `'${hotel}'`,
      check_in: `${today} - 3`,
      check_out: `${today} - 1`,
      rooms: "1",
      adults: "2",
    });
    const r = await review(priya, id, { rating: 3 });
    expect(r.subject_type).toBe("hotel");
    await service((tx) =>
      tx.query("select public.moderate_review($1, 'published', null, $2)", [r.id, admin]),
    );
    const stats = await db.query<{ rating_avg: string; rating_count: number }>(
      "select rating_avg, rating_count from public.hotels where id = $1",
      [hotel],
    );
    expect(stats.rows[0]).toEqual({ rating_avg: "3.0", rating_count: 1 });

    await service((tx) =>
      tx.query("select public.moderate_review($1, 'rejected', 'Off topic', $2)", [r.id, admin]),
    );
    const after = await db.query<{ rating_avg: string | null; rating_count: number }>(
      "select rating_avg, rating_count from public.hotels where id = $1",
      [hotel],
    );
    expect(after.rows[0]).toEqual({ rating_avg: null, rating_count: 0 });
  });

  it("only accepts photos from the reviewer's own folder", async () => {
    const id = await booking(ravi);
    await complete(id);
    const bad = `reviews/${priya}/${crypto.randomUUID()}.jpg`;
    expect(await errorOf(() => review(ravi, id, { photos: [bad] }))).toContain("invalid_photo");
    const good = `reviews/${ravi}/${crypto.randomUUID()}.jpg`;
    const r = await review(ravi, id, { photos: [good] });
    const media = await asAnon(
      db,
      async (tx) =>
        (await tx.query("select file_path from public.review_media where review_id = $1", [r.id])).rows,
    );
    expect(media).toHaveLength(0);
    const mine = await asUser(
      db,
      ravi,
      async (tx) =>
        (await tx.query("select file_path from public.review_media where review_id = $1", [r.id])).rows,
    );
    expect(mine).toEqual([{ file_path: good }]);
  });
});

describe("P&S Rewards", () => {
  let earner: string;

  beforeAll(async () => {
    earner = await createUser(db, "earner@example.com");
  });

  it("earns 1% of a completed booking and gives points back on refund", async () => {
    const id = await booking(earner, 5_000_00);
    expect(await balance(earner)).toBe(0);
    await complete(id);
    expect(await balance(earner)).toBe(50);
    await db.query(
      "update public.bookings set refunded_paise = 2_000_00, status = 'partially_refunded' where id = $1",
      [id],
    );
    expect(await balance(earner)).toBe(30);
  });

  it("turns points into a personal one-time code that only the owner can use", async () => {
    await service((tx) => tx.query("select public.adjust_points($1, 200, 'Goodwill', $2)", [earner, admin]));
    expect(await balance(earner)).toBe(230);
    expect(
      await errorOf(() => service((tx) => tx.query("select public.redeem_points($1, 50)", [earner]))),
    ).toContain("below_minimum");
    expect(
      await errorOf(() => service((tx) => tx.query("select public.redeem_points($1, 500)", [earner]))),
    ).toContain("insufficient_points");

    const { rows } = await service((tx) =>
      tx.query<{ c: { id: string; code: string; value: number; user_id: string } }>(
        "select to_jsonb(public.redeem_points($1, 150)) as c",
        [earner],
      ),
    );
    const coupon = rows[0].c;
    expect(coupon).toMatchObject({ value: 150_00, user_id: earner });
    expect(coupon.code).toMatch(/^PSR[A-Z0-9]{8}$/);
    expect(await balance(earner)).toBe(80);

    const theirs = await booking(ravi);
    expect(
      await errorOf(() =>
        db.query(
          "insert into public.coupon_redemptions (coupon_id, booking_id, user_id, discount_paise) values ($1, $2, $3, 0)",
          [coupon.id, theirs, ravi],
        ),
      ),
    ).toContain("coupon_invalid");
  });

  it("gives points back when a reward code lapses unused, and expires old points", async () => {
    await db.query(
      "update public.coupons set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where user_id = $1",
      [earner],
    );
    await service((tx) => tx.query("select public.expire_loyalty_points()"));
    expect(await balance(earner)).toBe(230);
    await service((tx) => tx.query("select public.expire_loyalty_points()"));
    expect(await balance(earner)).toBe(230);

    // The 50 points earned expire; the staff credit (no expiry) and refund adjustments stay.
    await db.query(
      "update public.loyalty_ledger set expires_at = now() - interval '1 day' where user_id = $1 and kind = 'earn'",
      [earner],
    );
    await service((tx) => tx.query("select public.expire_loyalty_points()"));
    // Earned 50, of which 20 were taken back by the refund: 30 left to expire.
    expect(await balance(earner)).toBe(200);
  });

  it("awards points for a published review once", async () => {
    const reviewer = await createUser(db, "reviewer@example.com");
    const id = await booking(reviewer, 100_00);
    await complete(id);
    const before = await balance(reviewer);
    const r = await review(reviewer, id);
    await service((tx) =>
      tx.query("select public.moderate_review($1, 'published', null, $2)", [r.id, admin]),
    );
    await service((tx) =>
      tx.query("select public.moderate_review($1, 'published', null, $2)", [r.id, admin]),
    );
    expect((await balance(reviewer)) - before).toBe(25);
  });

  it("only shows customers their own points", async () => {
    const rows = await asUser(
      db,
      ravi,
      async (tx) => (await tx.query("select 1 from public.loyalty_ledger where user_id = $1", [earner])).rows,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("referrals", () => {
  it("rewards both friends on the new customer's first completed booking", async () => {
    const referrer = await createUser(db, "referrer@example.com");
    const friend = await createUser(db, "friend@example.com");
    const { rows } = await service((tx) =>
      tx.query<{ code: string }>("select public.ensure_referral_code($1) as code", [referrer]),
    );
    const code = rows[0].code;
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    const again = await service((tx) =>
      tx.query<{ code: string }>("select public.ensure_referral_code($1) as code", [referrer]),
    );
    expect(again.rows[0].code).toBe(code);

    const claim = (user: string, c: string) =>
      service((tx) => tx.query("select public.claim_referral($1, $2)", [user, c]));
    expect(await errorOf(() => claim(friend, "NOPE1234"))).toContain("invalid_code");
    expect(await errorOf(() => claim(referrer, code))).toContain("self_referral");
    await claim(friend, code.toLowerCase());
    expect(await errorOf(() => claim(friend, code))).toContain("already_referred");

    const first = await booking(friend, 1_000_00);
    await complete(first);
    expect(await balance(referrer)).toBe(100);
    expect(await balance(friend)).toBe(110);

    const second = await booking(friend, 1_000_00);
    await complete(second);
    expect(await balance(referrer)).toBe(100);
  });

  it("does not let a customer with a completed booking claim a code, or set their own code", async () => {
    const referrer = await createUser(db, "referrer2@example.com");
    const { rows } = await service((tx) =>
      tx.query<{ code: string }>("select public.ensure_referral_code($1) as code", [referrer]),
    );
    expect(
      await errorOf(() =>
        service((tx) => tx.query("select public.claim_referral($1, $2)", [ravi, rows[0].code])),
      ),
    ).toContain("not_eligible");
    expect(
      await errorOf(() =>
        asUser(db, ravi, (tx) =>
          tx.query("update public.profiles set referral_code = 'MINE1234' where id = $1", [ravi]),
        ),
      ),
    ).toContain("managed by the platform");
  });
});

describe("wishlist, travellers and notes", () => {
  it("keeps each customer's wishlist and travellers private", async () => {
    const hotel = (await db.query<{ id: string }>("select id from public.hotels limit 1")).rows[0].id;
    await asUser(db, priya, (tx) =>
      tx.query("insert into public.wishlists (subject_type, subject_id) values ('hotel', $1)", [hotel]),
    );
    await asUser(db, priya, (tx) =>
      tx.query("insert into public.travellers (full_name) values ('Asha Sharma')"),
    );
    const theirs = await asUser(db, ravi, async (tx) => ({
      wish: (await tx.query("select 1 from public.wishlists")).rows.length,
      trav: (await tx.query("select 1 from public.travellers")).rows.length,
    }));
    expect(theirs).toEqual({ wish: 0, trav: 0 });
    expect(
      await errorOf(() =>
        asUser(db, ravi, (tx) =>
          tx.query(
            "insert into public.wishlists (user_id, subject_type, subject_id) values ($1, 'hotel', $2)",
            [priya, hotel],
          ),
        ),
      ),
    ).toContain("row-level security");
  });

  it("lets only staff read and write customer notes", async () => {
    expect(
      await errorOf(() =>
        asUser(db, ravi, (tx) =>
          tx.query("insert into public.customer_notes (user_id, body) values ($1, 'hi')", [priya]),
        ),
      ),
    ).toContain("row-level security");
    await asUser(db, admin, (tx) =>
      tx.query("insert into public.customer_notes (user_id, body) values ($1, 'Prefers ground floor')", [
        priya,
      ]),
    );
    const rows = await asUser(
      db,
      admin,
      async (tx) =>
        (await tx.query("select body from public.customer_notes where user_id = $1", [priya])).rows,
    );
    expect(rows).toEqual([{ body: "Prefers ground floor" }]);
  });
});
