import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let manager: string;
let agentA: string;
let agentB: string;
let privateTour: string;
let yatra: string;
let enquiryOnly: string;
let firstDeparture: string;
let codeSeq = 0;
let phoneSeq = 0;

const service = <T>(fn: (tx: Transaction) => Promise<T>) => asService(db, fn);

async function idOf(table: string, column: string, value: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.${table} where ${column} = $1`, [
    value,
  ]);
  return rows[0].id;
}

const nextPhone = () => `+9198${String(10_000_000 + ++phoneSeq).padStart(8, "0")}`;
const nextCode = (prefix: string) => `${prefix}${String(++codeSeq).padStart(4, "0")}`;

type BookOpts = {
  user?: string;
  pkg?: string;
  departure?: string | null;
  start?: string;
  adults?: number;
  children?: number;
  mode?: "full" | "part" | "pay_at_hotel";
  expiresAt?: string;
};

function isoDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function departureDate(id: string): Promise<string> {
  const { rows } = await db.query<{ d: string }>(
    "select start_date::text as d from public.package_departures where id = $1",
    [id],
  );
  return rows[0].d;
}

async function book(o: BookOpts) {
  const pkg = o.pkg ?? yatra;
  const departure = o.departure === undefined ? firstDeparture : o.departure;
  const start = o.start ?? (departure ? await departureDate(departure) : isoDate(10));
  const adults = o.adults ?? 2;
  const amount = 1_850_000 * adults;
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string; status: string } }>(
      "select public.create_package_booking($1, $2, $3) as r",
      [
        JSON.stringify({
          code: nextCode("PSTPKG"),
          user_id: o.user ?? alice,
          check_in: start,
          check_out: start,
          adults,
          children: o.children ?? 0,
          contact_name: "Yatri One",
          contact_email: "yatri@example.com",
          contact_phone: "+919876543210",
          subtotal_paise: amount,
          discount_paise: 0,
          tax_paise: 0,
          total_paise: amount,
          payable_now_paise: o.mode === "part" ? Math.round(amount / 4) : amount,
          payment_mode: o.mode ?? "part",
          price_breakdown: { lines: [] },
          expires_at: o.expiresAt ?? new Date(Date.now() + 20 * 60_000).toISOString(),
        }),
        JSON.stringify([
          {
            kind: "package",
            line_key: "package:adult",
            description: "Adults",
            quantity: adults,
            amount_paise: amount,
            discount_paise: 0,
            tax_rate_bps: 0,
            tax_paise: 0,
            sac: "998555",
          },
        ]),
        JSON.stringify({
          package_id: pkg,
          departure_id: departure,
          start_date: start,
          end_date: start,
          adults,
          children: o.children ?? 0,
          travellers: [{ name: "Yatri Two", age: 30 }],
        }),
      ],
    );
    return rows[0].r;
  });
}

async function lead(extra: Record<string, unknown> = {}) {
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; number: number; assigned_to: string | null } }>(
      "select public.create_lead($1) as r",
      [
        JSON.stringify({
          kind: "flight",
          name: "Asha Traveller",
          phone: nextPhone(),
          email: "asha@example.com",
          details: { from: "DEL", to: "VNS", depart_on: isoDate(15), adults: 2, children: 0 },
          source: "instagram",
          utm: { source: "instagram", campaign: "diwali" },
          ...extra,
        }),
      ],
    );
    return rows[0].r;
  });
}

async function leadRow(id: string) {
  const { rows } = await db.query<{
    status: string;
    assigned_to: string | null;
    next_follow_up_at: string | null;
    last_contacted_at: string | null;
    booking_id: string | null;
    value_paise: number | null;
    lost_reason: string | null;
  }>(
    "select status::text, assigned_to, next_follow_up_at, last_contacted_at, booking_id, value_paise, lost_reason from public.leads where id = $1",
    [id],
  );
  return rows[0];
}

const LINES = [
  {
    key: "line:1",
    description: "Delhi → Varanasi, 2 adults",
    quantity: 2,
    unit_price_paise: 450_000,
    amount_paise: 900_000,
    tax_rate_bps: 500,
    tax_paise: 45_000,
    sac: "998555",
  },
];

async function saveQuote(leadId: string, overrides: Record<string, unknown> = {}) {
  return service(async (tx) => {
    const { rows } = await tx.query<{ id: string }>("select public.save_quote($1, $2) as id", [
      JSON.stringify({
        lead_id: leadId,
        title: "Flight DEL → VNS",
        lines: LINES,
        subtotal_paise: 900_000,
        tax_paise: 45_000,
        total_paise: 945_000,
        pay_now_paise: 945_000,
        valid_until: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        ...overrides,
      }),
      agentA,
    ]);
    return rows[0].id;
  });
}

const token = () =>
  Array.from({ length: 48 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

async function sendQuote(quoteId: string) {
  return service(async (tx) => {
    const { rows } = await tx.query<{ r: { id: string; code: string } }>(
      "select public.send_quote($1, $2, $3, $4) as r",
      [
        quoteId,
        JSON.stringify({ code: nextCode("PSTQTE"), snapshot: { trip: { label: "Flight" } } }),
        token(),
        agentA,
      ],
    );
    return rows[0].r;
  });
}

async function quoteRow(id: string) {
  const { rows } = await db.query<{ status: string; booking_id: string | null; token: string | null }>(
    "select status::text, booking_id, token from public.quotes where id = $1",
    [id],
  );
  return rows[0];
}

async function bookingStatus(id: string) {
  const { rows } = await db.query<{ status: string; service: string; paid_paise: number }>(
    "select status::text, service::text, paid_paise from public.bookings where id = $1",
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  manager = await createUser(db, "manager@example.com");
  agentA = await createUser(db, "agent-a@example.com");
  agentB = await createUser(db, "agent-b@example.com");
  await db.query("select public.grant_role_by_email('manager@example.com', 'manager')");
  await db.query("select public.grant_role_by_email('agent-a@example.com', 'agent')");
  await db.query("select public.grant_role_by_email('agent-b@example.com', 'agent')");
  privateTour = await idOf("packages", "slug", "demo-vrindavan-mathura-govardhan");
  yatra = await idOf("packages", "slug", "demo-braj-84-kos-yatra");
  enquiryOnly = await idOf("packages", "slug", "demo-agra-mathura-vrindavan");
  firstDeparture = (
    await db.query<{ id: string }>(
      "select id from public.package_departures where package_id = $1 order by start_date limit 1",
      [yatra],
    )
  ).rows[0].id;
}, 60_000);

describe("package catalog", () => {
  it("shows live packages, tiers, itinerary and departures to everyone", async () => {
    await asAnon(db, async (tx) => {
      const pkgs = await tx.query<{ slug: string }>("select slug from public.packages order by sort_order");
      expect(pkgs.rows.map((r) => r.slug)).toEqual([
        "demo-vrindavan-mathura-govardhan",
        "demo-braj-84-kos-yatra",
        "demo-agra-mathura-vrindavan",
      ]);
      const tiers = await tx.query("select * from public.package_pricing_tiers where package_id = $1", [
        privateTour,
      ]);
      expect(tiers.rows).toHaveLength(3);
      const days = await tx.query("select * from public.package_itinerary_days where package_id = $1", [
        yatra,
      ]);
      expect(days.rows).toHaveLength(7);
      const seats = await tx.query<{ seats_left: number }>(
        "select seats_left from public.package_departure_seats($1)",
        [yatra],
      );
      expect(seats.rows.map((r) => r.seats_left)).toEqual([30, 30, 30]);
    });
  });

  it("hides archived packages and their details from the public, not from staff", async () => {
    await db.query("update public.packages set is_active = false where id = $1", [enquiryOnly]);
    await asAnon(db, async (tx) => {
      const { rows } = await tx.query("select id from public.packages where id = $1", [enquiryOnly]);
      expect(rows).toHaveLength(0);
      const tiers = await tx.query("select id from public.package_pricing_tiers where package_id = $1", [
        enquiryOnly,
      ]);
      expect(tiers.rows).toHaveLength(0);
    });
    await asUser(db, agentA, async (tx) => {
      const { rows } = await tx.query("select id from public.packages where id = $1", [enquiryOnly]);
      expect(rows).toHaveLength(1);
    });
    await db.query("update public.packages set is_active = true where id = $1", [enquiryOnly]);
  });

  it("lets package managers edit the catalog but not agents or customers", async () => {
    await asUser(db, manager, async (tx) => {
      await tx.query("update public.package_departures set seats_total = 29 where id = $1", [firstDeparture]);
    });
    for (const user of [agentA, alice]) {
      await asUser(db, user, async (tx) => {
        const res = await tx.query("update public.packages set sort_order = 99 where id = $1 returning id", [
          privateTour,
        ]);
        expect(res.rows).toHaveLength(0);
      });
    }
    const audit = await db.query(
      "select 1 from public.audit_logs where table_name = 'package_departures' and actor_id = $1",
      [manager],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });
});

describe("package bookings", () => {
  it("books a departure, counts the seats and lets only the owner read it", async () => {
    await db.query("update public.package_departures set seats_total = 30 where id = $1", [firstDeparture]);
    const created = await book({ adults: 3, children: 1 });
    expect(created.status).toBe("pending_payment");
    const { rows } = await db.query<{ seats_left: number; departure_id: string }>(
      "select departure_id, seats_left from public.package_departure_seats($1)",
      [yatra],
    );
    expect(rows.find((r) => r.departure_id === firstDeparture)?.seats_left).toBe(26);
    const guests = await db.query("select full_name from public.booking_guests where booking_id = $1", [
      created.id,
    ]);
    expect(guests.rows).toHaveLength(2);

    await asUser(db, alice, async (tx) => {
      const own = await tx.query("select * from public.package_bookings where booking_id = $1", [created.id]);
      expect(own.rows).toHaveLength(1);
    });
    await asUser(db, bob, async (tx) => {
      const other = await tx.query("select * from public.package_bookings where booking_id = $1", [
        created.id,
      ]);
      expect(other.rows).toHaveLength(0);
    });
  });

  it("refuses more travellers than seats left, and expired holds stop counting", async () => {
    await db.query("update public.package_departures set seats_total = 6 where id = $1", [firstDeparture]);
    await expect(book({ adults: 3 })).rejects.toThrow(/sold_out/);
    await db.query(
      "update public.bookings set expires_at = now() - interval '1 minute' where id in (select booking_id from public.package_bookings where departure_id = $1)",
      [firstDeparture],
    );
    const ok = await book({ adults: 3 });
    expect(ok.status).toBe("pending_payment");
    await db.query("update public.package_departures set seats_total = 30 where id = $1", [firstDeparture]);
  });

  it("refuses enquiry-only packages, pay later, past dates and a departure of another package", async () => {
    await expect(book({ pkg: enquiryOnly, departure: null, start: isoDate(10) })).rejects.toThrow(
      /package_unavailable/,
    );
    await expect(book({ mode: "pay_at_hotel" })).rejects.toThrow(/payment_mode/);
    await expect(book({ pkg: privateTour, departure: null, start: isoDate(-1) })).rejects.toThrow(
      /departure_closed/,
    );
    await expect(book({ pkg: privateTour, departure: null, start: isoDate(5) })).resolves.toMatchObject({
      status: "pending_payment",
    });
    const otherDeparture = (
      await db.query<{ id: string }>(
        "select id from public.package_departures where package_id = $1 order by start_date desc limit 1",
        [yatra],
      )
    ).rows[0].id;
    await expect(book({ departure: otherDeparture, start: isoDate(3) })).rejects.toThrow(/departure_closed/);
  });

  it("is a service-role function only", async () => {
    await asUser(db, alice, async (tx) => {
      await expect(tx.query("select public.create_package_booking('{}', '[]', '{}')")).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe("leads", () => {
  it("writes a lead with its activity and assigns the least loaded agent", async () => {
    const first = await lead();
    const second = await lead();
    expect(first.number).toBeGreaterThan(0);
    expect(second.number).toBe(first.number + 1);
    expect(new Set([first.assigned_to, second.assigned_to])).toEqual(new Set([agentA, agentB]));
    const acts = await db.query<{ kind: string }>(
      "select kind::text from public.lead_activities where lead_id = $1 order by created_at",
      [first.id],
    );
    expect(acts.rows.map((r) => r.kind)).toEqual(["system", "assignment"]);
    expect((await leadRow(first.id)).next_follow_up_at).not.toBeNull();
  });

  it("leaves leads unassigned when auto-assignment is off", async () => {
    await db.query(
      "update public.settings set value = jsonb_set(value, '{auto_assign}', '\"none\"') where key = 'leads.defaults'",
    );
    const l = await lead();
    expect(l.assigned_to).toBeNull();
    await db.query(
      "update public.settings set value = jsonb_set(value, '{auto_assign}', '\"least_loaded\"') where key = 'leads.defaults'",
    );
  });

  it("throttles enquiries per phone number", async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) await lead({ phone });
    await expect(lead({ phone })).rejects.toThrow(/rate_limited/);
  });

  it("is visible to lead staff only and never writable through the API", async () => {
    const l = await lead();
    await asUser(db, agentB, async (tx) => {
      const { rows } = await tx.query("select id from public.leads where id = $1", [l.id]);
      expect(rows).toHaveLength(1);
      const upd = await tx.query("update public.leads set status = 'won' where id = $1 returning id", [l.id]);
      expect(upd.rows).toHaveLength(0);
    });
    await asUser(db, alice, async (tx) => {
      const { rows } = await tx.query("select id from public.leads where id = $1", [l.id]);
      expect(rows).toHaveLength(0);
    });
    await asAnon(db, async (tx) => {
      await expect(tx.query("select public.create_lead('{}')")).rejects.toThrow(/permission denied/);
    });
  });

  it("moves through statuses: contact, lost with a reason, reopen, won", async () => {
    const l = await lead();
    await service((tx) =>
      tx.query("select public.log_lead_activity($1, 'call', 'Asked for prices', $2, 'connected', 95, $3)", [
        l.id,
        agentA,
        new Date(Date.now() + 86_400_000).toISOString(),
      ]),
    );
    let row = await leadRow(l.id);
    expect(row.status).toBe("contacted");
    expect(row.last_contacted_at).not.toBeNull();

    await expect(
      service((tx) => tx.query("select public.set_lead_status($1, 'lost', $2)", [l.id, agentA])),
    ).rejects.toThrow(/reason_required/);
    await expect(
      service((tx) => tx.query("select public.set_lead_status($1, 'quoted', $2)", [l.id, agentA])),
    ).rejects.toThrow(/invalid_transition/);
    await service((tx) =>
      tx.query("select public.set_lead_status($1, 'lost', $2, 'Price too high')", [l.id, agentA]),
    );
    row = await leadRow(l.id);
    expect(row).toMatchObject({ status: "lost", lost_reason: "Price too high", next_follow_up_at: null });
    await service((tx) => tx.query("select public.set_lead_status($1, 'contacted', $2)", [l.id, agentA]));
    await service((tx) => tx.query("select public.set_lead_status($1, 'won', $2)", [l.id, agentA]));
    row = await leadRow(l.id);
    expect(row).toMatchObject({ status: "won", lost_reason: null });
    await expect(
      service((tx) => tx.query("select public.set_lead_status($1, 'contacted', $2)", [l.id, agentA])),
    ).rejects.toThrow(/invalid_transition/);
  });

  it("assigns only to staff who can work leads", async () => {
    const l = await lead();
    await expect(
      service((tx) => tx.query("select public.assign_lead($1, $2, $3)", [l.id, alice, manager])),
    ).rejects.toThrow(/assignee_invalid/);
    await service((tx) => tx.query("select public.assign_lead($1, $2, $3)", [l.id, manager, manager]));
    expect((await leadRow(l.id)).assigned_to).toBe(manager);
  });
});

describe("quotes", () => {
  it("re-checks totals on save and edits drafts only", async () => {
    const l = await lead();
    await expect(saveQuote(l.id, { subtotal_paise: 1 })).rejects.toThrow(/totals_mismatch/);
    const id = await saveQuote(l.id);
    await saveQuote(l.id, { id, title: "Flight DEL → VNS (updated)" });
    await sendQuote(id);
    await expect(saveQuote(l.id, { id })).rejects.toThrow(/invalid_transition/);
  });

  it("sends a quote as an unpaid booking, hides the token and wins the lead when the link is paid", async () => {
    const l = await lead();
    const id = await saveQuote(l.id, { pay_now_paise: 300_000 });
    const booking = await sendQuote(id);
    expect(await bookingStatus(booking.id)).toMatchObject({ status: "pending_payment", service: "travel" });
    expect(await leadRow(l.id)).toMatchObject({ status: "quoted", value_paise: 945_000 });
    const q = await quoteRow(id);
    expect(q.status).toBe("sent");
    expect(q.token).toMatch(/^[0-9a-f]{48}$/);

    await asUser(db, agentA, async (tx) => {
      const { rows } = await tx.query("select id, status from public.quotes where id = $1", [id]);
      expect(rows).toHaveLength(1);
      await expect(tx.query("select token from public.quotes where id = $1", [id])).rejects.toThrow(
        /permission denied/,
      );
    });

    await service(async (tx) => {
      await tx.query(
        "select public.create_payment_link_payment($1, 'plink_q1', 'https://rzp.io/x', 300000, $2)",
        [booking.id, agentA],
      );
      await tx.query("select public.attach_quote_link($1, 'https://rzp.io/x')", [id]);
      const { rows } = await tx.query<{ r: { result: string } }>("select public.record_payment($1) as r", [
        JSON.stringify({
          payment_link_id: "plink_q1",
          payment_id: "pay_q1",
          status: "captured",
          amount_paise: 300_000,
          method: "upi",
        }),
      ]);
      expect(rows[0].r.result).toBe("confirmed");
    });
    expect(await bookingStatus(booking.id)).toMatchObject({ status: "confirmed", paid_paise: 300_000 });
    expect((await quoteRow(id)).status).toBe("paid");
    expect(await leadRow(l.id)).toMatchObject({ status: "won", booking_id: booking.id });
  });

  it("withdraws the previous sent quote when a new one goes out", async () => {
    const l = await lead({
      kind: "package",
      package_id: privateTour,
      details: { adults: 2, start_date: isoDate(9) },
    });
    const first = await saveQuote(l.id);
    const firstBooking = await sendQuote(first);
    expect(await bookingStatus(firstBooking.id)).toMatchObject({ service: "package" });
    const second = await saveQuote(l.id, { title: "Cheaper option" });
    await sendQuote(second);
    expect((await quoteRow(first)).status).toBe("cancelled");
    expect((await bookingStatus(firstBooking.id)).status).toBe("cancelled");
  });

  it("expires with its booking, and can be withdrawn by hand", async () => {
    const l = await lead();
    const id = await saveQuote(l.id);
    const booking = await sendQuote(id);
    await db.query("update public.bookings set expires_at = now() - interval '1 minute' where id = $1", [
      booking.id,
    ]);
    await service((tx) => tx.query("select public.expire_stale_bookings()"));
    expect((await quoteRow(id)).status).toBe("expired");

    const other = await saveQuote(l.id);
    const otherBooking = await sendQuote(other);
    await service((tx) => tx.query("select public.cancel_quote($1, $2)", [other, agentA]));
    expect((await quoteRow(other)).status).toBe("cancelled");
    expect((await bookingStatus(otherBooking.id)).status).toBe("cancelled");
  });

  it("confirms on an offline payment, and refuses quotes for closed leads", async () => {
    const l = await lead();
    const id = await saveQuote(l.id);
    const booking = await sendQuote(id);
    await service((tx) =>
      tx.query("select public.record_quote_offline_payment($1, 945000, 'upi', 'UTR123', $2)", [id, manager]),
    );
    expect(await bookingStatus(booking.id)).toMatchObject({ status: "confirmed", paid_paise: 945_000 });
    expect((await leadRow(l.id)).status).toBe("won");
    await expect(saveQuote(l.id)).rejects.toThrow(/lead_closed/);
  });
});
