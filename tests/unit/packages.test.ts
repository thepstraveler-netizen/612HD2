import { describe, expect, it } from "vitest";
import { finalizePrice } from "@/lib/pricing/booking";
import {
  checkTiers,
  departureState,
  endDate,
  firstBookableDate,
  fromPrice,
  packageLines,
  pickTier,
} from "@/lib/packages/pricing";
import type { PackageDetail, PricingTier } from "@/lib/packages/types";
import { travelProvider } from "@/lib/travel/provider";
import {
  enquirySchema,
  packageCheckoutSchema,
  packagesSettingsSchema,
  travelEnquirySchema,
  travelSettingsSchema,
} from "@/schemas/packages";

const tiers: PricingTier[] = [
  { id: "t3", minPax: 6, maxPax: 12, adultPricePaise: 379_900, childPricePaise: 250_000 },
  { id: "t1", minPax: 1, maxPax: 2, adultPricePaise: 599_900, childPricePaise: 250_000 },
  { id: "t2", minPax: 3, maxPax: 5, adultPricePaise: 449_900, childPricePaise: null },
];

const pkg: Pick<PackageDetail, "tiers" | "minPax" | "maxPax" | "taxBps" | "sac" | "title" | "days"> = {
  tiers,
  minPax: 1,
  maxPax: 12,
  taxBps: 500,
  sac: "998555",
  title: { en: "Braj Darshan" },
  days: 2,
};

describe("package tiers", () => {
  it("picks the tier holding the whole group", () => {
    expect(pickTier(tiers, 1)?.id).toBe("t1");
    expect(pickTier(tiers, 2)?.id).toBe("t1");
    expect(pickTier(tiers, 3)?.id).toBe("t2");
    expect(pickTier(tiers, 12)?.id).toBe("t3");
    expect(pickTier(tiers, 13)).toBeNull();
  });

  it("shows the lowest adult price on cards", () => {
    expect(fromPrice(tiers)).toBe(379_900);
    expect(fromPrice([])).toBeNull();
  });

  it("checks admin tiers for overlaps, gaps and coverage", () => {
    expect(checkTiers(tiers, 1, 12)).toBeNull();
    expect(checkTiers([], 1, 12)).toBe("empty");
    expect(
      checkTiers(
        [
          { minPax: 1, maxPax: 4 },
          { minPax: 4, maxPax: 8 },
        ],
        1,
        8,
      ),
    ).toBe("overlap");
    expect(
      checkTiers(
        [
          { minPax: 1, maxPax: 2 },
          { minPax: 4, maxPax: 8 },
        ],
        1,
        8,
      ),
    ).toBe("gap");
    expect(checkTiers([{ minPax: 1, maxPax: 5 }], 1, 8)).toBe("gap");
    expect(checkTiers([{ minPax: 2, maxPax: 8 }], 1, 8)).toBe("gap");
    expect(checkTiers([{ minPax: 5, maxPax: 3 }], 1, 8)).toBe("range");
    // Tiers wider than the package's group limits are fine.
    expect(checkTiers([{ minPax: 1, maxPax: 50 }], 2, 10)).toBeNull();
  });
});

describe("package price lines", () => {
  it("prices adults and children from the tier, plus the departure supplement and GST", () => {
    const r = packageLines(
      pkg,
      { supplementPaise: 50_000 },
      { startDate: "2026-11-01", adults: 2, children: 1 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.tier.id).toBe("t2");
    const price = finalizePrice(r.quote.drafts, 0, []);
    expect(price.lines.map((l) => [l.key, l.amountPaise])).toEqual([
      ["package:adult", 899_800],
      // t2 has no child price: children pay the adult price.
      ["package:child", 449_900],
      ["surcharge:departure", 150_000],
    ]);
    expect(price.taxPaise).toBe(Math.round(899_800 * 0.05) + Math.round(449_900 * 0.05) + 7_500);
    expect(price.totalPaise).toBe(price.subtotalPaise + price.taxPaise);
  });

  it("adds the convenience fee at its own GST, never discounted", () => {
    const r = packageLines(
      pkg,
      null,
      { startDate: "2026-11-01", adults: 1, children: 0 },
      { convenienceFeePaise: 10_000, feeTaxBps: 1800, feeSac: "998599" },
    );
    if (!r.ok) throw new Error("expected ok");
    const price = finalizePrice(r.quote.drafts, 100_000, []);
    const fee = price.lines.find((l) => l.key === "fee:convenience");
    expect(fee).toMatchObject({ discountPaise: 0, taxRateBps: 1800, taxPaise: 1_800 });
    expect(price.discountPaise).toBe(100_000);
  });

  it("refuses group sizes outside the package's limits", () => {
    expect(packageLines(pkg, null, { startDate: "2026-11-01", adults: 13, children: 0 })).toEqual({
      ok: false,
      error: "group_size",
    });
    expect(packageLines(pkg, null, { startDate: "2026-11-01", adults: 0, children: 2 })).toEqual({
      ok: false,
      error: "group_size",
    });
    expect(
      packageLines({ ...pkg, tiers: [tiers[1]] }, null, { startDate: "2026-11-01", adults: 4, children: 0 }),
    ).toEqual({ ok: false, error: "no_tier" });
  });
});

describe("departures and dates", () => {
  it("closes online booking near departure and when seats run out", () => {
    const today = "2026-10-02";
    expect(departureState({ startDate: "2026-10-03", seatsLeft: 10 }, 2, today, 2)).toBe("closed");
    expect(departureState({ startDate: "2026-10-04", seatsLeft: 10 }, 2, today, 2)).toBe("open");
    expect(departureState({ startDate: "2026-10-10", seatsLeft: 1 }, 2, today, 2)).toBe("sold_out");
    expect(departureState({ startDate: "2026-10-10", seatsLeft: null }, 40, today, 2)).toBe("open");
    expect(firstBookableDate(today, 2)).toBe("2026-10-04");
  });

  it("ends a tour on its last day", () => {
    expect(endDate("2026-10-30", 3)).toBe("2026-11-01");
    expect(endDate("2026-10-30", 1)).toBe("2026-10-30");
  });
});

describe("package and travel schemas", () => {
  it("fills settings defaults", () => {
    expect(packagesSettingsSchema.parse({})).toMatchObject({ advance_percent: 25, book_until_days: 2 });
    expect(travelSettingsSchema.parse({}).classes.train).toContain("3A");
  });

  it("validates travel enquiries", () => {
    const base = {
      kind: "flight",
      from: "Delhi",
      to: "Varanasi",
      departOn: "2026-11-10",
      name: "Asha",
      phone: "98765 43210",
    };
    const ok = travelEnquirySchema.parse(base);
    expect(ok.phone).toBe("+919876543210");
    expect(travelEnquirySchema.safeParse({ ...base, to: "delhi" }).success).toBe(false);
    expect(travelEnquirySchema.safeParse({ ...base, returnOn: "2026-11-01" }).success).toBe(false);
    expect(enquirySchema.parse({ ...base, kind: "train" }).kind).toBe("train");
  });

  it("rejects filled honeypots and keeps bad attribution from failing the form", () => {
    const e = enquirySchema.parse({
      kind: "service",
      serviceSlug: "calling-centre",
      name: "Ravi",
      phone: "9876543210",
      attribution: { source: "???", utm: "nope", referrer: 42 },
    });
    expect(e.attribution).toMatchObject({ source: undefined, utm: {} });
    expect(
      enquirySchema.safeParse({ kind: "general", name: "Bot", phone: "9876543210", website: "spam" }).success,
    ).toBe(false);
  });

  it("parses package checkout input", () => {
    const c = packageCheckoutSchema.parse({ packageSlug: "braj", startDate: "2026-11-01", adults: "2" });
    expect(c).toMatchObject({ adults: 2, children: 0, paymentMode: "part" });
  });

  it("falls back to the manual travel provider", async () => {
    const p = travelProvider("unknown");
    expect(p.key).toBe("manual");
    expect(p.live).toBe(false);
    expect(
      await p.search({
        mode: "bus",
        from: "A",
        to: "B",
        departOn: "2026-11-01",
        returnOn: null,
        adults: 1,
        children: 0,
        travelClass: null,
      }),
    ).toEqual([]);
  });
});
