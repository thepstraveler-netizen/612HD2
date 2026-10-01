import { describe, expect, it } from "vitest";
import type { CabCatalog } from "@/lib/cabs/queries";
import { cabOffers, planTrip, quoteCategory, tripLabel } from "@/lib/cabs/search";
import { cabSettingsSchema, parseCabSearch } from "@/schemas/cabs";

const settings = cabSettingsSchema.parse({});
const now = new Date("2026-12-01T04:30:00Z"); // 10:00 India time

const rule = (rate: number) => ({
  ratePerKmPaise: rate,
  minKm: 80,
  minKmPerDay: 250,
  driverAllowancePerDayPaise: 30_000,
  nightChargePaise: 25_000,
  extraKmPaise: rate,
  tollsIncluded: false,
  waitingFreeMinutes: 45,
  waitingPerHourPaise: 10_000,
});

const catalog: CabCatalog = {
  places: [
    {
      id: "p-vrn",
      slug: "vrindavan",
      name: { en: "Vrindavan" },
      kind: "city",
      lat: 27.565,
      lng: 77.6593,
      isPopular: true,
    },
    {
      id: "p-agr",
      slug: "agra",
      name: { en: "Agra" },
      kind: "city",
      lat: 27.1767,
      lng: 78.0081,
      isPopular: true,
    },
    {
      id: "p-jai",
      slug: "jaipur",
      name: { en: "Jaipur" },
      kind: "city",
      lat: 26.9124,
      lng: 75.7873,
      isPopular: true,
    },
    {
      id: "p-mtj",
      slug: "mathura-junction",
      name: { en: "Mathura Junction" },
      kind: "station",
      lat: 27.4799,
      lng: 77.6791,
      isPopular: true,
    },
  ],
  categories: [
    {
      id: "c-sedan",
      key: "sedan",
      name: { en: "Sedan" },
      description: null,
      bodyType: "sedan",
      seats: 4,
      luggage: 2,
      isAc: true,
      image: null,
      models: [{ name: "Swift Dzire", fuel: "cng", isFeatured: true }],
      rules: { one_way: rule(1300), round_trip: { ...rule(1200), minKm: 0 } },
    },
    {
      id: "c-suv",
      key: "suv",
      name: { en: "SUV" },
      description: null,
      bodyType: "muv",
      seats: 6,
      luggage: 2,
      isAc: true,
      image: null,
      models: [],
      rules: { one_way: rule(1600) },
    },
  ],
  routes: [
    {
      id: "r-agra",
      slug: "vrindavan-agra",
      tripType: "one_way",
      fromId: "p-vrn",
      toId: "p-agr",
      name: null,
      description: null,
      stops: [],
      distanceKm: 75,
      durationMinutes: 105,
      isPopular: true,
      fares: { "c-sedan": { farePaise: 150_000, extraKmPaise: 1300, tollsIncluded: true } },
    },
    {
      id: "r-mtj",
      slug: "mathura-junction-to-vrindavan",
      tripType: "transfer",
      fromId: "p-mtj",
      toId: "p-vrn",
      name: null,
      description: null,
      stops: [],
      distanceKm: 14,
      durationMinutes: 30,
      isPopular: true,
      fares: { "c-sedan": { farePaise: 70_000, extraKmPaise: 1300, tollsIncluded: true } },
    },
    {
      id: "r-tour",
      slug: "braj-darshan-day-tour",
      tripType: "sightseeing",
      fromId: "p-vrn",
      toId: "p-vrn",
      name: { en: "Braj darshan day tour" },
      description: null,
      stops: ["Gokul", "Govardhan", "Barsana"],
      distanceKm: 140,
      durationMinutes: 600,
      isPopular: true,
      fares: { "c-sedan": { farePaise: 300_000, extraKmPaise: 1300, tollsIncluded: false } },
    },
  ],
  packages: [
    {
      id: "k-8",
      key: "8hr-80km",
      name: { en: "8 hr / 80 km" },
      hours: 8,
      km: 80,
      fares: {
        "c-sedan": { farePaise: 200_000, extraKmPaise: 1300, extraHourPaise: 15_000 },
        "c-suv": { farePaise: 260_000, extraKmPaise: 1600, extraHourPaise: 20_000 },
      },
    },
  ],
  addons: [
    {
      id: "a-roof",
      key: "roof-carrier",
      name: { en: "Roof carrier" },
      description: null,
      pricePaise: 25_000,
      tripTypes: ["one_way", "round_trip"],
      categoryIds: [],
    },
  ],
  surcharges: [],
};

const search = (params: Record<string, string>) => parseCabSearch(params);

describe("planTrip", () => {
  it("uses the route's distance and fixed fare when one exists", () => {
    const r = planTrip(
      search({ type: "one_way", from: "vrindavan", to: "agra", at: "2026-12-05T09:00" }),
      catalog,
      settings,
      now,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan).toMatchObject({ distanceKm: 75, distanceSource: "route" });
    const offers = cabOffers(r.plan, catalog, settings);
    expect(offers.map((o) => o.category.key)).toEqual(["sedan", "suv"]);
    // Sedan: fixed ₹1,500 + 5% GST. SUV: per km, 80 km × ₹16 + ₹300 allowance + 5%.
    expect(offers[0].totalPaise).toBe(157_500);
    expect(offers[1].totalPaise).toBe(Math.round((128_000 + 30_000) * 1.05));
  });

  it("estimates distance for pairs without a route", () => {
    const r = planTrip(
      search({ type: "one_way", from: "agra", to: "jaipur", at: "2026-12-05T09:00" }),
      catalog,
      settings,
      now,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.distanceSource).toBe("estimate");
    expect(r.plan.distanceKm).toBeGreaterThan(250);
  });

  it("requires a configured route for transfers and finds tours by slug", () => {
    expect(
      planTrip(
        search({ type: "transfer", from: "agra", to: "vrindavan", at: "2026-12-05T09:00" }),
        catalog,
        settings,
        now,
      ),
    ).toEqual({ ok: false, error: "no_route" });
    const tour = planTrip(
      search({ type: "sightseeing", route: "braj-darshan-day-tour", at: "2026-12-05T07:00" }),
      catalog,
      settings,
      now,
    );
    if (!tour.ok) throw new Error(tour.error);
    expect(tripLabel(tour.plan, catalog.categories[0])).toBe("Sedan · Braj darshan day tour");
    expect(cabOffers(tour.plan, catalog, settings).map((o) => o.category.key)).toEqual(["sedan"]);
  });

  it("rejects incomplete, same-place and too-soon searches", () => {
    expect(planTrip(search({ type: "one_way", from: "vrindavan" }), catalog, settings, now)).toEqual({
      ok: false,
      error: "incomplete",
    });
    expect(
      planTrip(
        search({ type: "one_way", from: "agra", to: "agra", at: "2026-12-05T09:00" }),
        catalog,
        settings,
        now,
      ),
    ).toEqual({ ok: false, error: "same_place" });
    expect(
      planTrip(
        search({ type: "one_way", from: "vrindavan", to: "agra", at: "2026-12-01T11:00" }),
        catalog,
        settings,
        now,
      ),
    ).toEqual({ ok: false, error: "too_soon" });
  });

  it("prices round trips per km even when a one-way route fare exists, and lists cars that fit first", () => {
    const r = planTrip(
      search({
        type: "round_trip",
        from: "vrindavan",
        to: "agra",
        at: "2026-12-05T09:00",
        back: "2026-12-06T18:00",
        pax: "5",
      }),
      catalog,
      settings,
      now,
    );
    if (!r.ok) throw new Error(r.error);
    const offers = cabOffers(r.plan, catalog, settings);
    // The SUV has no round-trip rule, so only the sedan is offered, and it doesn't fit 5.
    expect(offers.map((o) => [o.category.key, o.fits])).toEqual([["sedan", false]]);
    const q = quoteCategory(r.plan, catalog.categories[0], catalog, settings, { addons: [], fee: null });
    expect(q?.drafts.find((l) => l.key === "fare")?.amountPaise).toBe(500 * 1200);
  });

  it("prices local packages per category", () => {
    const r = planTrip(
      search({ type: "local", from: "vrindavan", pkg: "8hr-80km", at: "2026-12-05T09:00" }),
      catalog,
      settings,
      now,
    );
    if (!r.ok) throw new Error(r.error);
    expect(cabOffers(r.plan, catalog, settings).map((o) => o.totalPaise)).toEqual([210_000, 273_000]);
  });
});
