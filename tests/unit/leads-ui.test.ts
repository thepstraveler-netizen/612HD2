import { describe, expect, it } from "vitest";
import {
  OTHER_REASON,
  followUpPickAt,
  followUpTone,
  groupLeadsByStatus,
  hasLeadFilters,
  hoursLeft,
  leadFiltersQuery,
  leadStatusTone,
  leadTravelFacts,
  lostReasonOptions,
  lostReasonText,
  parseLeadFilters,
  quoteActions,
  quoteFormDefaults,
  quoteLinesToInput,
  quotePreview,
  quoteStatusTone,
  utmEntries,
} from "@/lib/leads/ui";
import { priceQuote } from "@/lib/leads/quote";
import { leadsSettingsSchema, quoteFormSchema, quoteLineInputSchema, type LeadStatus } from "@/schemas/leads";

const SETTINGS = leadsSettingsSchema.parse({});
const LEAD = "6f1c1a52-6a52-4d4c-9d43-5d1d1b0e8a11";
const STAFF = "0b8f0e8a-1e7a-4d39-a1a7-9a2d0b8c4f22";

describe("follow-up quick picks (India time)", () => {
  // 2026-10-02 22:10 IST = 16:40 UTC.
  const now = new Date("2026-10-02T16:40:30Z");

  it("puts 'in 1 hour' an hour out, to the minute", () => {
    expect(followUpPickAt("hour", now)).toBe("2026-10-02T17:40:00.000Z");
  });

  it("puts 'tomorrow' at 10 am India time on the next India day", () => {
    // 10:00 IST = 04:30 UTC.
    expect(followUpPickAt("tomorrow", now)).toBe("2026-10-03T04:30:00.000Z");
    expect(followUpPickAt("threeDays", now)).toBe("2026-10-05T04:30:00.000Z");
  });

  it("uses the India date, not the UTC date, just after midnight IST", () => {
    // 00:20 IST on 3 Oct is still 2 Oct in UTC.
    const late = new Date("2026-10-02T18:50:00Z");
    expect(followUpPickAt("tomorrow", late)).toBe("2026-10-04T04:30:00.000Z");
  });
});

describe("pipeline filters in the URL", () => {
  it("drops defaults (board view, page 1) and empty values", () => {
    expect(leadFiltersQuery({ view: "board", page: 1 })).toBe("");
    expect(leadFiltersQuery({ view: "board", status: "new", q: "", page: 3 })).toBe("?status=new");
  });

  it("keeps the list view and its page, and applies overrides", () => {
    const filters = parseLeadFilters({ view: "list", source: "calling", assignee: "me", page: "2" });
    expect(leadFiltersQuery(filters)).toBe("?view=list&source=calling&assignee=me&page=2");
    expect(leadFiltersQuery(filters, { page: 3 })).toBe("?view=list&source=calling&assignee=me&page=3");
    expect(leadFiltersQuery(filters, { view: "board" })).toBe("?source=calling&assignee=me");
    expect(leadFiltersQuery(filters, { due: "overdue", page: 1 })).toBe(
      "?view=list&source=calling&assignee=me&due=overdue",
    );
  });

  it("parses search params: first value wins, junk falls back", () => {
    const f = parseLeadFilters({
      status: ["won", "lost"],
      kind: "rocket",
      assignee: STAFF,
      due: "today",
      q: "  ",
      page: "x",
    });
    expect(f).toMatchObject({
      view: "board",
      status: "won",
      kind: undefined,
      assignee: STAFF,
      due: "today",
      page: 1,
    });
    expect(f.q).toBeUndefined();
    expect(hasLeadFilters(f)).toBe(true);
    expect(hasLeadFilters(parseLeadFilters({ view: "list" }))).toBe(false);
  });

  it("round-trips through the query string", () => {
    const f = parseLeadFilters({ view: "list", status: "quoted", kind: "flight", q: "LD-00042", page: "4" });
    const back = parseLeadFilters(Object.fromEntries(new URLSearchParams(leadFiltersQuery(f).slice(1))));
    expect(back).toEqual(f);
  });
});

describe("board grouping and tones", () => {
  it("puts every lead in its status column, keeping order, with all columns present", () => {
    const leads: { id: string; status: LeadStatus }[] = [
      { id: "a", status: "new" },
      { id: "b", status: "won" },
      { id: "c", status: "new" },
    ];
    const groups = groupLeadsByStatus(leads);
    expect(Object.keys(groups)).toEqual(["new", "contacted", "quoted", "won", "lost"]);
    expect(groups.new.map((l) => l.id)).toEqual(["a", "c"]);
    expect(groups.won.map((l) => l.id)).toEqual(["b"]);
    expect(groups.lost).toEqual([]);
  });

  it("colours statuses and follow-ups", () => {
    expect(leadStatusTone("won")).toBe("success");
    expect(leadStatusTone("new")).toBe("info");
    expect(quoteStatusTone("expired")).toBe("danger");
    expect(quoteStatusTone("paid")).toBe("success");
    expect(followUpTone("overdue")).toBe("danger");
    expect(followUpTone("today")).toBe("warning");
  });
});

describe("lead facts", () => {
  it("reads travel details and skips what is missing", () => {
    expect(
      leadTravelFacts({
        from: "DEL",
        to: "VNS",
        depart_on: "2026-10-12",
        adults: 2,
        children: "1",
        class: null,
      }),
    ).toEqual({
      from: "DEL",
      to: "VNS",
      departOn: "2026-10-12",
      returnOn: "",
      startDate: "",
      adults: 2,
      children: 1,
      travelClass: "",
    });
  });

  it("orders UTM tags and drops empty ones", () => {
    expect(
      utmEntries({ utm_campaign: "diwali", utm_source: "instagram", utm_term: "", gclid: "x1" }),
    ).toEqual([
      ["utm_source", "instagram"],
      ["utm_campaign", "diwali"],
      ["gclid", "x1"],
    ]);
  });

  it("picks the lost reason, or the agent's own words for Other", () => {
    expect(lostReasonOptions(SETTINGS.lost_reasons)).not.toContain("Other");
    expect(lostReasonText("Price too high", "ignored")).toBe("Price too high");
    expect(lostReasonText(OTHER_REASON, "  Going by own car ")).toBe("Going by own car");
    expect(lostReasonText(OTHER_REASON, "  ")).toBe("");
  });
});

describe("quote builder helpers", () => {
  const lines = [
    { description: "Hotel, 2 nights", quantity: 2, unitPrice: "2500", taxPercent: 12, sac: "996311" },
    { description: "Cab transfers", quantity: 1, unitPrice: "1800.50", taxPercent: 5, sac: "996601" },
  ];

  it("previews the same totals the server computes", () => {
    const preview = quotePreview(lines);
    const server = priceQuote(lines.map((l) => quoteLineInputSchema.parse(l)));
    expect(preview.totalPaise).toBe(server.totalPaise);
    expect(preview.subtotalPaise).toBe(680050);
    expect(preview.incomplete).toBe(false);
  });

  it("leaves unfinished lines out of the preview and flags them", () => {
    const preview = quotePreview([
      ...lines,
      { description: "", quantity: 1, unitPrice: "", taxPercent: 5, sac: "998555" },
    ]);
    expect(preview.incomplete).toBe(true);
    expect(preview.subtotalPaise).toBe(680050);
    expect(quotePreview([]).totalPaise).toBe(0);
  });

  it("starts a new quote with the configured GST, SAC and validity", () => {
    const values = quoteFormDefaults(LEAD, SETTINGS, undefined, "Flight DEL → VNS");
    expect(values.lines).toEqual([
      { description: "", quantity: 1, unitPrice: "", taxPercent: 5, sac: "998555" },
    ]);
    expect(values).toMatchObject({ title: "Flight DEL → VNS", payNow: "full", validHours: 48 });
  });

  it("turns a saved draft back into builder values that re-save to the same lines", () => {
    const priced = priceQuote(lines.map((l) => quoteLineInputSchema.parse(l)));
    const now = new Date("2026-10-02T10:00:00Z");
    const draft = {
      id: STAFF,
      title: "Varanasi trip",
      lines: priced.lines,
      totalPaise: priced.totalPaise,
      payNowPaise: 200000,
      validUntil: "2026-10-03T09:30:00Z",
      notes: null,
      terms: "50% advance",
    };
    const values = quoteFormDefaults(LEAD, SETTINGS, draft, "", now);
    expect(values).toMatchObject({
      quoteId: STAFF,
      payNow: "advance",
      advance: "2000",
      validHours: 24,
      notes: "",
    });
    expect(quoteLinesToInput(priced.lines)[1]).toEqual({
      description: "Cab transfers",
      quantity: 1,
      unitPrice: "1800.50",
      taxPercent: 5,
      sac: "996601",
    });
    const reparsed = quoteFormSchema.parse(values);
    expect(priceQuote(reparsed.lines)).toEqual(priced);
    expect(reparsed.advance).toBe(200000);
  });

  it("falls back to the default validity once a draft has expired", () => {
    const now = new Date("2026-10-02T10:00:00Z");
    expect(hoursLeft("2026-10-02T09:00:00Z", 48, now)).toBe(48);
    expect(hoursLeft("2026-10-02T10:20:00Z", 48, now)).toBe(1);
  });

  it("offers only the actions that apply", () => {
    const all = { canWrite: true, canPay: true, leadOpen: true };
    expect(quoteActions("draft", all)).toEqual(["edit", "send", "withdraw"]);
    expect(quoteActions("sent", all)).toEqual(["withdraw", "recordPayment"]);
    expect(quoteActions("sent", { ...all, canPay: false })).toEqual(["withdraw"]);
    expect(quoteActions("draft", { ...all, leadOpen: false })).toEqual(["withdraw"]);
    expect(quoteActions("paid", all)).toEqual([]);
    expect(quoteActions("sent", { canWrite: false, canPay: false, leadOpen: true })).toEqual([]);
  });
});
