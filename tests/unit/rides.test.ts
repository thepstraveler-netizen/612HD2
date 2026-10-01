import { describe, expect, it } from "vitest";
import { finalizePrice } from "@/lib/pricing/booking";
import { baseRideFare, estimateRide, findZone, quoteRide, type RideFareRule } from "@/lib/rides/pricing";
import type { RideCatalog } from "@/lib/rides/queries";
import { nowPickup, planRide, quoteVehicle, rideLabel, rideOffers } from "@/lib/rides/search";
import { parseRideSearch, rideSettingsSchema } from "@/schemas/rides";

const settings = rideSettingsSchema.parse({});
const now = new Date("2026-12-01T04:30:00Z"); // 10:00 India time

const rule = (o: Partial<RideFareRule> = {}): RideFareRule => ({
  basePaise: 3000,
  includedKm: 2,
  perKmPaise: 800,
  minFarePaise: 3000,
  hourlyRatePaise: 15_000,
  minHours: 1,
  kmPerHour: 10,
  freeWaitingMinutes: 5,
  perMinWaitingPaise: 100,
  nightBps: 12_500,
  ...o,
});

const catalog: RideCatalog = {
  types: [
    {
      id: "t-bike",
      key: "bike",
      serviceSlug: "bike",
      name: { en: "Bike" },
      description: null,
      icon: "bike",
      seats: 1,
      instantBook: true,
      taxBps: 500,
    },
    {
      id: "t-erik",
      key: "e-rickshaw",
      serviceSlug: "rickshaw",
      name: { en: "E-Rickshaw" },
      description: null,
      icon: "battery-charging",
      seats: 4,
      instantBook: true,
      taxBps: 0,
    },
  ],
  zones: [
    { id: "z-vrn", slug: "vrindavan", name: { en: "Vrindavan" }, lat: 27.58, lng: 77.69, radiusKm: 8 },
    { id: "z-mat", slug: "mathura", name: { en: "Mathura" }, lat: 27.4924, lng: 77.6737, radiusKm: 8 },
  ],
  points: [
    {
      id: "p-isk",
      zoneId: "z-vrn",
      slug: "iskcon",
      name: { en: "ISKCON Temple" },
      kind: "temple",
      lat: 27.5724,
      lng: 77.6738,
      isPopular: true,
    },
    {
      id: "p-bb",
      zoneId: "z-vrn",
      slug: "banke-bihari",
      name: { en: "Banke Bihari Temple" },
      kind: "temple",
      lat: 27.5806,
      lng: 77.7006,
      isPopular: true,
    },
    {
      id: "p-jan",
      zoneId: "z-mat",
      slug: "janmabhoomi",
      name: { en: "Krishna Janmabhoomi" },
      kind: "temple",
      lat: 27.5047,
      lng: 77.6697,
      isPopular: true,
    },
  ],
  fares: [
    { ...rule(), zoneId: "z-vrn", vehicleTypeId: "t-bike", mode: "point_to_point" },
    { ...rule(), zoneId: "z-vrn", vehicleTypeId: "t-bike", mode: "hourly" },
    { ...rule({ perKmPaise: 1000 }), zoneId: "z-vrn", vehicleTypeId: "t-erik", mode: "point_to_point" },
  ],
};

describe("ride fares", () => {
  it("charges the minimum fare for short rides and per km beyond the included distance", () => {
    expect(baseRideFare(rule(), "point_to_point", { distanceKm: 1.2, hours: null }).farePaise).toBe(3000);
    // 3000 + (5.5 − 2) × 800 = 5800
    expect(baseRideFare(rule(), "point_to_point", { distanceKm: 5.5, hours: null }).farePaise).toBe(5800);
    // Rounded to whole rupees: 3000 + 1.33 × 800 = 4064 → 4100
    expect(baseRideFare(rule(), "point_to_point", { distanceKm: 3.33, hours: null }).farePaise).toBe(4100);
    expect(
      baseRideFare(rule({ minFarePaise: 9000 }), "point_to_point", { distanceKm: 4, hours: null }).farePaise,
    ).toBe(9000);
  });

  it("charges hourly rides for at least the minimum hours and includes km per hour", () => {
    expect(baseRideFare(rule({ minHours: 2 }), "hourly", { distanceKm: null, hours: 1 })).toEqual({
      farePaise: 30_000,
      includedKm: 20,
      hours: 2,
    });
    expect(baseRideFare(rule(), "hourly", { distanceKm: null, hours: 3 }).farePaise).toBe(45_000);
  });

  const quote = (pickupAt: Date, fee = 0) =>
    quoteRide({
      mode: "point_to_point",
      rule: rule(),
      distanceKm: 5.5,
      hours: null,
      pickupAt,
      night: { start: "22:00", end: "06:00" },
      label: "Bike · A → B",
      taxBps: 500,
      sac: "996601",
      convenienceFeePaise: fee,
      feeTaxBps: 1800,
      feeSac: "998552",
    });

  it("adds the night surcharge in the night window only", () => {
    const day = quote(now);
    expect(day.drafts.map((d) => d.key)).toEqual(["fare"]);
    expect(day.terms.night).toBe(false);
    const night = quote(new Date("2026-12-01T17:30:00Z")); // 23:00 India time
    expect(night.drafts.find((d) => d.key === "surcharge:night")?.amountPaise).toBe(1500);
    expect(night.terms.night).toBe(true);
  });

  it("taxes the fare at the vehicle rate and the fee at its own rate", () => {
    const price = finalizePrice(quote(now, 2000).drafts, 0, []);
    expect(price.lines.map((l) => [l.key, l.taxRateBps, l.taxPaise])).toEqual([
      ["fare", 500, 290],
      ["fee:convenience", 1800, 360],
    ]);
    expect(price.totalPaise).toBe(5800 + 290 + 2000 + 360);
  });
});

describe("zones and distance", () => {
  it("picks the nearest zone that contains the point", () => {
    expect(findZone(catalog.zones, { lat: 27.575, lng: 77.69 })?.slug).toBe("vrindavan");
    expect(findZone(catalog.zones, { lat: 27.5, lng: 77.67 })?.slug).toBe("mathura");
    expect(findZone(catalog.zones, { lat: 28.6, lng: 77.2 })).toBeNull();
  });

  it("estimates road distance with the road factor", () => {
    const e = estimateRide(
      { lat: 27.5724, lng: 77.6738 },
      { lat: 27.5806, lng: 77.7006 },
      { roadFactor: 1.3, avgSpeedKmph: 18 },
    );
    expect(e.distanceKm).toBeGreaterThan(3);
    expect(e.distanceKm).toBeLessThan(4.5);
    expect(e.durationMinutes).toBeGreaterThanOrEqual(10);
  });
});

describe("planning a ride", () => {
  const search = (q: Record<string, string>) => parseRideSearch(q);

  it("plans a landmark-to-landmark ride now, in the pickup's zone", () => {
    const r = planRide(search({ from: "iskcon", to: "banke-bihari" }), catalog, settings, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.zone.slug).toBe("vrindavan");
    expect(r.plan.isNow).toBe(true);
    expect(r.plan.pickupAt.toISOString()).toBe("2026-12-01T04:40:00.000Z");
    expect(rideLabel(r.plan, catalog.types[0])).toBe("Bike · ISKCON Temple → Banke Bihari Temple");
  });

  it("uses the browser location for pickup and finds its zone", () => {
    const r = planRide(
      search({ from: "here", flat: "27.585", flng: "77.695", to: "iskcon" }),
      catalog,
      settings,
      now,
    );
    expect(r.ok && r.plan.zone.slug).toBe("vrindavan");
    expect(r.ok && rideLabel(r.plan, catalog.types[0])).toBe("Bike · Current location → ISKCON Temple");
    const far = planRide(
      search({ from: "here", flat: "28.6", flng: "77.2", to: "iskcon" }),
      catalog,
      settings,
      now,
    );
    expect(far).toEqual({ ok: false, error: "out_of_area" });
  });

  it("rejects incomplete, unknown, identical and over-long rides", () => {
    expect(planRide(search({ from: "iskcon" }), catalog, settings, now)).toEqual({
      ok: false,
      error: "incomplete",
    });
    expect(planRide(search({ from: "nowhere", to: "iskcon" }), catalog, settings, now)).toEqual({
      ok: false,
      error: "unknown_point",
    });
    expect(planRide(search({ from: "iskcon", to: "iskcon" }), catalog, settings, now)).toEqual({
      ok: false,
      error: "same_place",
    });
    const short = rideSettingsSchema.parse({ max_ride_km: 5 });
    expect(planRide(search({ from: "iskcon", to: "janmabhoomi" }), catalog, short, now)).toEqual({
      ok: false,
      error: "too_long",
    });
  });

  it("checks the booking window for later rides", () => {
    expect(
      planRide(
        search({ from: "iskcon", to: "banke-bihari", at: "2026-12-01T10:05" }),
        catalog,
        settings,
        now,
      ),
    ).toEqual({ ok: false, error: "too_soon" });
    expect(
      planRide(
        search({ from: "iskcon", to: "banke-bihari", at: "2026-12-20T10:00" }),
        catalog,
        settings,
        now,
      ),
    ).toEqual({ ok: false, error: "too_far" });
    const later = planRide(
      search({ from: "iskcon", to: "banke-bihari", at: "2026-12-02T07:00" }),
      catalog,
      settings,
      now,
    );
    expect(later.ok && later.plan.pickupAt.toISOString()).toBe("2026-12-02T01:30:00.000Z");
  });

  it("plans hourly rides without a drop and caps the hours", () => {
    const r = planRide(search({ mode: "hourly", from: "iskcon", hrs: "3" }), catalog, settings, now);
    expect(r.ok && r.plan.hours).toBe(3);
    expect(planRide(search({ mode: "hourly", from: "iskcon", hrs: "20" }), catalog, settings, now)).toEqual({
      ok: false,
      error: "too_many_hours",
    });
  });

  it("rounds the ride-now pickup up to 5 minutes", () => {
    expect(nowPickup(new Date("2026-12-01T04:31:10Z"), 10).toISOString()).toBe("2026-12-01T04:45:00.000Z");
  });
});

describe("ride offers", () => {
  it("prices every vehicle type with a fare in the zone and mode, and marks seat fit", () => {
    const r = planRide(
      parseRideSearch({ from: "iskcon", to: "banke-bihari", pax: "2" }),
      catalog,
      settings,
      now,
    );
    if (!r.ok) throw new Error(r.error);
    const offers = rideOffers(r.plan, catalog, settings);
    expect(offers.map((o) => [o.type.key, o.fits])).toEqual([
      ["bike", false],
      ["e-rickshaw", true],
    ]);
    const hourly = planRide(parseRideSearch({ mode: "hourly", from: "iskcon" }), catalog, settings, now);
    if (!hourly.ok) throw new Error(hourly.error);
    expect(rideOffers(hourly.plan, catalog, settings).map((o) => o.type.key)).toEqual(["bike"]);
    expect(quoteVehicle(hourly.plan, catalog.types[1], catalog, settings, null)).toBeNull();
  });
});
