import { describe, expect, it } from "vitest";
import {
  cabAdvance,
  checkTiming,
  estimateTrip,
  quoteCab,
  surchargeBps,
  type CabQuoteInput,
  type FareRule,
} from "@/lib/cabs/pricing";
import { fromIndiaLocal, isNightTime, toIndiaLocal, tripDays } from "@/lib/cabs/time";
import { finalizePrice } from "@/lib/pricing/booking";
import { cabCheckoutSchema, parseCabSearch } from "@/schemas/cabs";

const at = (local: string) => {
  const d = fromIndiaLocal(local);
  if (!d) throw new Error(local);
  return d;
};

const sedanOneWay: FareRule = {
  ratePerKmPaise: 1300,
  minKm: 80,
  minKmPerDay: 0,
  driverAllowancePerDayPaise: 30_000,
  nightChargePaise: 25_000,
  extraKmPaise: 1300,
  tollsIncluded: false,
  waitingFreeMinutes: 45,
  waitingPerHourPaise: 10_000,
};
const sedanRound: FareRule = {
  ...sedanOneWay,
  ratePerKmPaise: 1200,
  minKm: 0,
  minKmPerDay: 250,
  extraKmPaise: 1200,
};

function input(over: Partial<CabQuoteInput>): CabQuoteInput {
  return {
    tripType: "one_way",
    basis: { kind: "per_km", rule: sedanOneWay, distanceKm: 75 },
    label: "Sedan · Vrindavan → Agra",
    pickupAt: at("2026-12-10T09:00"),
    returnAt: null,
    night: { start: "22:00", end: "06:00", chargePaise: 25_000 },
    waiting: { freeMinutes: 45, perHourPaise: 10_000 },
    surchargeBps: 10_000,
    addons: [],
    taxBps: 500,
    sac: "996601",
    convenienceFeePaise: 0,
    feeTaxBps: 1800,
    feeSac: "998599",
    ...over,
  };
}

const amounts = (q: ReturnType<typeof quoteCab>) =>
  Object.fromEntries(q.drafts.map((l) => [l.key, l.amountPaise]));

describe("India time helpers", () => {
  it("round-trips local times and rejects impossible dates", () => {
    expect(toIndiaLocal(at("2026-12-10T05:30"))).toBe("2026-12-10T05:30");
    expect(at("2026-12-10T05:30").toISOString()).toBe("2026-12-10T00:00:00.000Z");
    expect(fromIndiaLocal("2026-02-30T10:00")).toBeNull();
  });

  it("detects the night window across midnight", () => {
    expect(isNightTime(at("2026-12-10T23:00"), "22:00", "06:00")).toBe(true);
    expect(isNightTime(at("2026-12-10T05:59"), "22:00", "06:00")).toBe(true);
    expect(isNightTime(at("2026-12-10T06:00"), "22:00", "06:00")).toBe(false);
  });

  it("counts round-trip days on the India calendar", () => {
    expect(tripDays(at("2026-12-10T23:00"), at("2026-12-11T01:00"))).toBe(2);
    expect(tripDays(at("2026-12-10T06:00"), at("2026-12-10T22:00"))).toBe(1);
    expect(tripDays(at("2026-12-10T06:00"), null)).toBe(1);
  });
});

describe("quoteCab", () => {
  it("charges the minimum km on short one-way trips plus a day's allowance", () => {
    const q = quoteCab(input({ basis: { kind: "per_km", rule: sedanOneWay, distanceKm: 40 } }));
    expect(amounts(q)).toEqual({ fare: 80 * 1300, "allowance:driver": 30_000 });
    expect(q.inclusions).toMatchObject({
      includedKm: 80,
      extraKmPaise: 1300,
      tollsIncluded: false,
      nightCharge: false,
    });
  });

  it("charges actual km beyond the minimum, rounded up", () => {
    const q = quoteCab(input({ basis: { kind: "per_km", rule: sedanOneWay, distanceKm: 182.3 } }));
    expect(amounts(q).fare).toBe(183 * 1300);
  });

  it("prices a round trip on the larger of the daily minimum and the distance both ways", () => {
    const short = quoteCab(
      input({
        tripType: "round_trip",
        basis: { kind: "per_km", rule: sedanRound, distanceKm: 75 },
        returnAt: at("2026-12-11T20:00"),
      }),
    );
    expect(amounts(short)).toEqual({ fare: 500 * 1200, "allowance:driver": 60_000 });
    expect(short.inclusions.days).toBe(2);

    const long = quoteCab(
      input({
        tripType: "round_trip",
        basis: { kind: "per_km", rule: sedanRound, distanceKm: 240 },
        returnAt: at("2026-12-10T22:00"),
      }),
    );
    expect(amounts(long).fare).toBe(480 * 1200);
  });

  it("uses a fixed route fare as is", () => {
    const q = quoteCab(
      input({
        tripType: "transfer",
        basis: { kind: "fixed", farePaise: 90_000, distanceKm: 14, extraKmPaise: 1300, tollsIncluded: true },
      }),
    );
    expect(amounts(q)).toEqual({ fare: 90_000 });
    expect(q.inclusions).toMatchObject({ includedKm: 14, tollsIncluded: true });
  });

  it("prices local packages without night charge or allowance", () => {
    const q = quoteCab(
      input({
        tripType: "local",
        pickupAt: at("2026-12-10T05:00"),
        basis: {
          kind: "local",
          farePaise: 220_000,
          hours: 8,
          km: 80,
          extraKmPaise: 1400,
          extraHourPaise: 15_000,
        },
      }),
    );
    expect(amounts(q)).toEqual({ fare: 220_000 });
    expect(q.inclusions).toMatchObject({ hours: 8, includedKm: 80, extraHourPaise: 15_000 });
  });

  it("adds a peak surcharge on the base fare, a night charge, add-ons and the fee", () => {
    const q = quoteCab(
      input({
        pickupAt: at("2026-12-10T23:30"),
        surchargeBps: 12_500,
        addons: [{ key: "roof-carrier", name: "Roof carrier", pricePaise: 25_000 }],
        convenienceFeePaise: 4_900,
      }),
    );
    expect(amounts(q)).toEqual({
      fare: 104_000,
      "surcharge:peak": 26_000,
      "allowance:driver": 30_000,
      "surcharge:night": 25_000,
      "addon:roof-carrier": 25_000,
      "fee:convenience": 4_900,
    });
    expect(q.inclusions.nightCharge).toBe(true);

    // Coupons apply to fare, surcharge and add-ons; GST at 5%, the fee at 18%.
    const price = finalizePrice(q.drafts, 10_000, []);
    const discountable = 104_000 + 26_000 + 25_000;
    expect(price.discountPaise).toBe(10_000);
    const fee = price.lines.find((l) => l.key === "fee:convenience");
    expect(fee).toMatchObject({ discountPaise: 0, taxRateBps: 1800, taxPaise: 882 });
    const cabTax = Math.round(((discountable + 30_000 + 25_000 - 10_000) * 500) / 10_000);
    expect(Math.abs(price.taxPaise - 882 - cabTax)).toBeLessThanOrEqual(3);
    expect(price.totalPaise).toBe(price.subtotalPaise - price.discountPaise + price.taxPaise);
  });
});

describe("surchargeBps", () => {
  const ctx = { pickupAt: at("2026-12-12T10:00"), tripType: "one_way" as const, categoryId: "sedan" };
  it("picks the highest matching rule", () => {
    expect(
      surchargeBps(
        [
          {
            multiplierBps: 11_000,
            startsOn: null,
            endsOn: null,
            weekdays: [6, 7],
            tripTypes: [],
            categoryIds: [],
          },
          {
            multiplierBps: 13_000,
            startsOn: "2026-12-10",
            endsOn: "2026-12-15",
            weekdays: [],
            tripTypes: ["one_way"],
            categoryIds: [],
          },
          {
            multiplierBps: 20_000,
            startsOn: null,
            endsOn: null,
            weekdays: [],
            tripTypes: ["local"],
            categoryIds: [],
          },
        ],
        ctx,
      ),
    ).toBe(13_000);
  });
  it("is neutral when nothing matches", () => {
    expect(
      surchargeBps(
        [
          {
            multiplierBps: 15_000,
            startsOn: null,
            endsOn: null,
            weekdays: [1],
            tripTypes: [],
            categoryIds: [],
          },
        ],
        ctx,
      ),
    ).toBe(10_000);
  });
});

describe("cabAdvance", () => {
  it("takes the larger of the share and the minimum, capped at the total", () => {
    expect(cabAdvance(1_000_000, 20, 50_000)).toBe(200_000);
    expect(cabAdvance(100_000, 20, 50_000)).toBe(50_000);
    expect(cabAdvance(30_000, 20, 50_000)).toBe(30_000);
    expect(cabAdvance(123_456, 25, 0)).toBe(30_900);
  });
});

describe("estimateTrip", () => {
  it("scales straight-line distance by the road factor", () => {
    const e = estimateTrip(
      { lat: 27.565, lng: 77.6593 },
      { lat: 27.1767, lng: 78.0081 },
      { roadFactor: 1.25, avgSpeedKmph: 45 },
    );
    expect(e.distanceKm).toBeGreaterThan(60);
    expect(e.distanceKm).toBeLessThan(80);
    expect(e.durationMinutes % 5).toBe(0);
  });
});

describe("checkTiming", () => {
  const now = at("2026-12-10T08:00");
  const limits = { minLeadMinutes: 120, maxAdvanceDays: 90, maxTripDays: 15 };
  it("enforces lead time, window and return order", () => {
    expect(
      checkTiming({ tripType: "one_way", pickupAt: at("2026-12-10T09:00"), returnAt: null, now }, limits),
    ).toBe("too_soon");
    expect(
      checkTiming({ tripType: "one_way", pickupAt: at("2026-12-10T11:00"), returnAt: null, now }, limits),
    ).toBeNull();
    expect(
      checkTiming({ tripType: "one_way", pickupAt: at("2027-06-10T11:00"), returnAt: null, now }, limits),
    ).toBe("too_far");
    expect(
      checkTiming({ tripType: "round_trip", pickupAt: at("2026-12-11T11:00"), returnAt: null, now }, limits),
    ).toBe("missing_return");
    expect(
      checkTiming(
        { tripType: "round_trip", pickupAt: at("2026-12-11T11:00"), returnAt: at("2026-12-11T10:00"), now },
        limits,
      ),
    ).toBe("return_before_pickup");
    expect(
      checkTiming(
        { tripType: "round_trip", pickupAt: at("2026-12-11T11:00"), returnAt: at("2026-12-30T10:00"), now },
        limits,
      ),
    ).toBe("trip_too_long");
  });
});

describe("cab schemas", () => {
  it("parses search params leniently", () => {
    expect(
      parseCabSearch({
        type: "round_trip",
        from: "vrindavan",
        to: "Agra!",
        pax: "x",
        at: "2026-12-10T09:00",
      }),
    ).toEqual({
      type: "round_trip",
      from: "vrindavan",
      at: "2026-12-10T09:00",
      pax: 2,
    });
  });
  it("never accepts pay-at-hotel for cabs", () => {
    expect(cabCheckoutSchema.safeParse({ category: "sedan", paymentMode: "pay_at_hotel" }).success).toBe(
      false,
    );
  });
});
