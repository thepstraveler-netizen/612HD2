import { describe, expect, it } from "vitest";
import { leadSource, utmFromSearch } from "@/lib/leads/attribution";
import { effectiveQuoteStatus, payNowAmount, priceQuote } from "@/lib/leads/quote";
import {
  endOfIndiaDay,
  followUpState,
  isOpen,
  leadReference,
  manualNext,
  summarizeLead,
  whatsappLink,
} from "@/lib/leads/status";
import {
  leadActivitySchema,
  leadFiltersSchema,
  leadStatusSchema,
  leadsSettingsSchema,
  quoteFormSchema,
} from "@/schemas/leads";

const SOURCES = leadsSettingsSchema.parse({}).sources;

describe("lead pipeline", () => {
  it("allows only the manual moves set_lead_status allows", () => {
    expect(manualNext("new")).toEqual(["contacted", "won", "lost"]);
    expect(manualNext("quoted")).toContain("contacted");
    expect(manualNext("won")).toEqual([]);
    expect(manualNext("lost")).toEqual(["contacted"]);
    expect(isOpen("quoted")).toBe(true);
    expect(isOpen("lost")).toBe(false);
  });

  it("formats references", () => {
    expect(leadReference(42)).toBe("LD-00042");
    expect(leadReference(1_234_567)).toBe("LD-1234567");
  });

  it("knows when a follow-up is due, in India time", () => {
    const now = new Date("2026-10-02T10:00:00+05:30");
    expect(followUpState("2026-10-02T09:00:00+05:30", "new", now)).toBe("overdue");
    expect(followUpState("2026-10-02T22:00:00+05:30", "contacted", now)).toBe("today");
    expect(followUpState("2026-10-03T00:30:00+05:30", "quoted", now)).toBe("upcoming");
    expect(followUpState("2026-10-01T09:00:00+05:30", "won", now)).toBeNull();
    expect(followUpState(null, "new", now)).toBeNull();
    expect(endOfIndiaDay(now).toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });

  it("summarises leads for the board and messages", () => {
    expect(
      summarizeLead({
        kind: "flight",
        details: { from: "Delhi", to: "Varanasi", depart_on: "2026-10-12", adults: 2, children: 1 },
      }),
    ).toBe("Flight Delhi → Varanasi · 12 Oct · 2 adults + 1 child");
    expect(summarizeLead({ kind: "package", details: { adults: 4 }, packageTitle: "Braj 84 Kos" })).toBe(
      "Braj 84 Kos · 4 adults",
    );
    expect(summarizeLead({ kind: "service", details: {}, serviceName: "Calling centre" })).toBe(
      "Calling centre",
    );
    expect(summarizeLead({ kind: "general", details: {} })).toBe("General enquiry");
  });

  it("builds WhatsApp links", () => {
    expect(whatsappLink("+91 98765-43210", "Namaste 🙏")).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent("Namaste 🙏")}`,
    );
  });
});

describe("quotes", () => {
  it("prices typed lines with GST per line", () => {
    const form = quoteFormSchema.parse({
      leadId: "6b1a3c1e-7c8d-4e5f-9a0b-1c2d3e4f5a6b",
      title: "DEL → VNS",
      validHours: 48,
      lines: [
        { description: "Air fare", quantity: 2, unitPrice: "4500", taxPercent: "0", sac: "996425" },
        { description: "Service fee", quantity: 1, unitPrice: "499.50", taxPercent: "18", sac: "998555" },
      ],
    });
    const q = priceQuote(form.lines);
    expect(q.lines.map((l) => [l.amount_paise, l.tax_rate_bps, l.tax_paise])).toEqual([
      [900_000, 0, 0],
      [49_950, 1800, 8_991],
    ]);
    expect(q).toMatchObject({ subtotalPaise: 949_950, taxPaise: 8_991, totalPaise: 958_941 });
    expect(q.lines[1]).toMatchObject({ key: "line:2", unit_price_paise: 49_950, quantity: 1 });
  });

  it("works out the pay-now amount", () => {
    expect(payNowAmount(100_000, "full", "")).toEqual({ ok: true, paise: 100_000 });
    expect(payNowAmount(100_000, "advance", 25_000)).toEqual({ ok: true, paise: 25_000 });
    expect(payNowAmount(100_000, "advance", "")).toEqual({ ok: false, error: "advance_required" });
    expect(payNowAmount(100_000, "advance", 100_000)).toEqual({ ok: false, error: "advance_too_high" });
  });

  it("reads a sent quote past its validity as expired", () => {
    const now = new Date("2026-10-02T10:00:00Z");
    expect(effectiveQuoteStatus("sent", "2026-10-02T09:00:00Z", now)).toBe("expired");
    expect(effectiveQuoteStatus("sent", "2026-10-03T09:00:00Z", now)).toBe("sent");
    expect(effectiveQuoteStatus("paid", "2026-10-01T09:00:00Z", now)).toBe("paid");
  });
});

describe("lead source tracking", () => {
  it("reads UTM tags", () => {
    expect(utmFromSearch(new URLSearchParams("utm_source=Instagram&utm_campaign=diwali&x=1"))).toEqual({
      source: "Instagram",
      campaign: "diwali",
    });
  });

  it("maps attribution to a CRM source", () => {
    expect(leadSource({ utm: { source: "Instagram" } }, SOURCES)).toBe("instagram");
    expect(leadSource({ utm: {}, referrer: "https://l.instagram.com/?u=x" }, SOURCES)).toBe("instagram");
    expect(leadSource({ utm: {}, referrer: "https://www.google.co.in/" }, SOURCES)).toBe("google");
    expect(leadSource({ source: "calling", utm: { source: "instagram" } }, SOURCES)).toBe("calling");
    expect(leadSource({ utm: { source: "tiktok" } }, SOURCES)).toBe("website");
    expect(leadSource({ utm: {}, referrer: "not a url" }, SOURCES)).toBe("website");
  });
});

describe("lead schemas", () => {
  it("needs a reason to mark a lead lost and an outcome to log a call", () => {
    const id = "6b1a3c1e-7c8d-4e5f-9a0b-1c2d3e4f5a6b";
    expect(leadStatusSchema.safeParse({ leadId: id, status: "lost" }).success).toBe(false);
    expect(leadStatusSchema.safeParse({ leadId: id, status: "lost", reason: "Price" }).success).toBe(true);
    expect(leadActivitySchema.safeParse({ leadId: id, kind: "call" }).success).toBe(false);
    expect(leadActivitySchema.safeParse({ leadId: id, kind: "call", callOutcome: "busy" }).success).toBe(
      true,
    );
    expect(leadActivitySchema.safeParse({ leadId: id, kind: "note" }).success).toBe(false);
  });

  it("falls back on bad filter params instead of failing the page", () => {
    expect(leadFiltersSchema.parse({ view: "x", status: "nope", page: "-3", assignee: "me" })).toMatchObject({
      view: "board",
      status: undefined,
      page: 1,
      assignee: "me",
    });
  });
});
