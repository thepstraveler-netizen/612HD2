import { describe, expect, it } from "vitest";
import type { CabInclusions } from "@/lib/cabs/pricing";
import {
  cabSearchQuery,
  cabSnapshot,
  cancellationItems,
  defaultPickupAt,
  driverActions,
  earliestPickupAt,
  fareLineKey,
  featuredModel,
  filterOffers,
  formatIndiaDateTime,
  freeCancellationHours,
  groupPlaces,
  inclusionItems,
  showPickupOtp,
  splitMinutes,
  tabForType,
  tripAllowsCancel,
  tripStatusTone,
  type PlaceOption,
} from "@/lib/cabs/ui";
import { isProtectedPath } from "@/lib/routing/protected";
import { parseCabSearch } from "@/schemas/cabs";

describe("cab search URL state", () => {
  it("defaults pickup to tomorrow 09:00 India time, even late in the UTC day", () => {
    expect(defaultPickupAt(new Date("2026-10-01T04:30:00Z"))).toBe("2026-10-02T09:00");
    // 20:00 UTC on the 1st is already 01:30 on the 2nd in India.
    expect(defaultPickupAt(new Date("2026-10-01T20:00:00Z"))).toBe("2026-10-03T09:00");
  });

  it("rounds the earliest pickup up to the next quarter hour after the lead time", () => {
    expect(earliestPickupAt(new Date("2026-10-01T04:31:00Z"), 120)).toBe("2026-10-01T12:15");
  });

  it("keeps only the keys each trip type uses and round-trips through the parser", () => {
    const base = {
      from: "vrindavan",
      to: "agra",
      pkg: "8hr-80km",
      route: "tour",
      at: "2026-10-02T09:00",
      pax: 3,
    };
    expect(cabSearchQuery({ ...base, type: "one_way", back: "2026-10-03T18:00" })).toEqual({
      type: "one_way",
      from: "vrindavan",
      to: "agra",
      at: "2026-10-02T09:00",
      pax: "3",
    });
    expect(cabSearchQuery({ ...base, type: "round_trip", back: "2026-10-03T18:00" })).toMatchObject({
      back: "2026-10-03T18:00",
    });
    expect(cabSearchQuery({ ...base, type: "local" })).toEqual({
      type: "local",
      from: "vrindavan",
      pkg: "8hr-80km",
      at: "2026-10-02T09:00",
      pax: "3",
    });
    expect(cabSearchQuery({ ...base, type: "sightseeing" })).toEqual({
      type: "sightseeing",
      route: "tour",
      at: "2026-10-02T09:00",
      pax: "3",
    });
    const query = cabSearchQuery({ ...base, type: "transfer" });
    expect(parseCabSearch(query)).toMatchObject({ type: "transfer", from: "vrindavan", to: "agra", pax: 3 });
  });

  it("maps trip types to widget tabs", () => {
    expect(tabForType("one_way")).toBe("outstation");
    expect(tabForType("round_trip")).toBe("outstation");
    expect(tabForType("local")).toBe("local");
    expect(tabForType("sightseeing")).toBe("sightseeing");
  });
});

describe("place picker groups", () => {
  const places: PlaceOption[] = [
    { slug: "vrindavan", name: "Vrindavan", kind: "city", isPopular: true },
    { slug: "gokul", name: "Gokul", kind: "city", isPopular: false },
    { slug: "mathura-junction", name: "Mathura Junction", kind: "station", isPopular: true },
    { slug: "delhi-airport", name: "Delhi Airport (IGI)", kind: "airport", isPopular: false },
  ];

  it("lists popular places first, then the rest by kind without repeats", () => {
    expect(groupPlaces(places).map((g) => [g.group, g.places.map((p) => p.slug)])).toEqual([
      ["popular", ["vrindavan", "mathura-junction"]],
      ["city", ["gokul"]],
      ["airport", ["delhi-airport"]],
    ]);
  });

  it("filters by name when searching and drops the popular group", () => {
    expect(groupPlaces(places, "  mathura ").map((g) => g.group)).toEqual(["station"]);
    expect(groupPlaces(places, "AIRPORT")[0].places[0].slug).toBe("delhi-airport");
    expect(groupPlaces(places, "zzz")).toEqual([]);
  });
});

describe("offer filters", () => {
  const offers = [
    {
      key: "sedan",
      models: [
        { name: "Dzire", fuel: "cng" },
        { name: "Amaze", fuel: "petrol" },
      ],
    },
    { key: "suv", models: [{ name: "Ertiga", fuel: "cng" }] },
    { key: "innova", models: [{ name: "Crysta", fuel: "diesel" }] },
  ];
  const keys = (f: Parameters<typeof filterOffers>[1]) => filterOffers(offers, f).map((o) => o.key);

  it("filters by category, model and fuel together", () => {
    expect(keys({ categories: [], models: [], fuels: [] })).toEqual(["sedan", "suv", "innova"]);
    expect(keys({ categories: ["suv", "innova"], models: [], fuels: [] })).toEqual(["suv", "innova"]);
    expect(keys({ categories: [], models: [], fuels: ["cng"] })).toEqual(["sedan", "suv"]);
    expect(keys({ categories: [], models: ["Amaze"], fuels: [] })).toEqual(["sedan"]);
    // The same model must match both picks.
    expect(keys({ categories: [], models: ["Amaze"], fuels: ["cng"] })).toEqual([]);
  });

  it("names the featured model, else the first", () => {
    expect(
      featuredModel([
        { name: "A", isFeatured: false },
        { name: "B", isFeatured: true },
      ])?.name,
    ).toBe("B");
    expect(featuredModel([{ name: "A", isFeatured: false }])?.name).toBe("A");
    expect(featuredModel([])).toBeUndefined();
  });
});

describe("inclusions and policy text", () => {
  const outstation: CabInclusions = {
    includedKm: 250,
    extraKmPaise: 1300,
    extraHourPaise: null,
    hours: null,
    days: 2,
    tollsIncluded: false,
    allowanceIncluded: true,
    nightCharge: true,
    waitingFreeMinutes: 45,
    waitingPerHourPaise: 10_000,
  };

  it("lists what an outstation fare covers and what's extra", () => {
    expect(inclusionItems(outstation, "round_trip")).toEqual([
      { key: "km", included: true, values: { km: 250 } },
      { key: "allowanceDays", included: true, values: { days: 2 } },
      { key: "tollsExtra", included: false },
      { key: "nightCharge", included: true },
      { key: "extraKm", included: false, money: { rate: 1300 } },
      { key: "waitingFree", included: true, values: { minutes: 45 } },
      { key: "waitingCharge", included: false, money: { rate: 10_000 } },
    ]);
  });

  it("shows hours and extra hours for local hire, without waiting terms", () => {
    const items = inclusionItems(
      {
        ...outstation,
        hours: 8,
        includedKm: 80,
        extraHourPaise: 18_000,
        days: 1,
        nightCharge: false,
        tollsIncluded: true,
      },
      "local",
    ).map((i) => i.key);
    expect(items).toEqual(["km", "hours", "allowance", "tollsIncluded", "extraKm", "extraHour"]);
  });

  it("orders refund tiers by notice and picks the right wording", () => {
    const rules = [
      { hours_before: 0, refund_percent: 0 },
      { hours_before: 24, refund_percent: 100 },
      { hours_before: 6, refund_percent: 50 },
    ];
    expect(cancellationItems(rules).map((c) => c.key)).toEqual(["full", "partial", "none"]);
    expect(cancellationItems([{ hours_before: 0, refund_percent: 25 }])[0].key).toBe("untilPickup");
    expect(freeCancellationHours(rules)).toBe(24);
    expect(freeCancellationHours([{ hours_before: 6, refund_percent: 50 }])).toBeNull();
  });

  it("labels fare lines by key", () => {
    expect(fareLineKey("fare").label).toBe("fare");
    expect(fareLineKey("surcharge:peak").label).toBe("peak");
    expect(fareLineKey("surcharge:night").label).toBe("night");
    expect(fareLineKey("allowance:driver").label).toBe("allowance");
    expect(fareLineKey("fee:convenience").label).toBe("fee");
    expect(fareLineKey("addon:roof-carrier")).toEqual({ label: "addon", addon: "roof-carrier" });
    expect(fareLineKey("room:x").label).toBe("other");
  });

  it("splits minutes into hours and minutes", () => {
    expect(splitMinutes(105)).toEqual({ hours: 1, minutes: 45 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("trip status", () => {
  it("gives each status a tone", () => {
    expect(tripStatusTone("awaiting_payment")).toBe("warning");
    expect(tripStatusTone("unassigned")).toBe("warning");
    expect(tripStatusTone("en_route")).toBe("info");
    expect(tripStatusTone("completed")).toBe("success");
    expect(tripStatusTone("no_show")).toBe("danger");
  });

  it("shows the pickup OTP only on a paid trip before pickup", () => {
    expect(showPickupOtp("confirmed", "assigned", "1234")).toBe(true);
    expect(showPickupOtp("confirmed", "unassigned", "1234")).toBe(true);
    expect(showPickupOtp("confirmed", "picked_up", "1234")).toBe(false);
    expect(showPickupOtp("pending_payment", "awaiting_payment", "1234")).toBe(false);
    expect(showPickupOtp("cancelled", "cancelled", "1234")).toBe(false);
    expect(showPickupOtp("confirmed", "assigned", null)).toBe(false);
  });

  it("allows online cancellation until the driver sets off", () => {
    expect(tripAllowsCancel(null)).toBe(true);
    expect(tripAllowsCancel("assigned")).toBe(true);
    expect(tripAllowsCancel("en_route")).toBe(false);
    expect(tripAllowsCancel("completed")).toBe(false);
  });

  it("turns the driver's next steps into buttons, asking for the OTP at pickup", () => {
    expect(driverActions(["picked_up", "no_show"], true)).toEqual([
      { status: "picked_up", primary: true, needsOtp: true },
      { status: "no_show", primary: false, needsOtp: false },
    ]);
    expect(driverActions(["picked_up"], false)[0].needsOtp).toBe(false);
    expect(driverActions([], true)).toEqual([]);
  });

  it("formats times in India time", () => {
    expect(formatIndiaDateTime("2026-10-02T03:30:00Z", "en")).toMatch(/9:00\s?am/i);
  });
});

describe("cab booking snapshot", () => {
  it("reads the cab part of a booking snapshot and ignores hotel snapshots", () => {
    const snap = cabSnapshot({
      trip: {
        type: "one_way",
        label: "Sedan · Vrindavan → Agra",
        route: "Vrindavan → Agra",
        vehicle: "Swift Dzire or similar",
        pickupAt: "2026-10-02T03:30:00.000Z",
        returnAt: null,
        stops: [],
      },
      category: { key: "sedan", name: { en: "Sedan", hi: "सेडान" }, seats: 4 },
      cancellationRules: [{ hours_before: 24, refund_percent: 100 }],
    });
    expect(snap?.trip.route).toBe("Vrindavan → Agra");
    expect(snap?.cancellationRules).toHaveLength(1);
    expect(cabSnapshot({ hotel: { name: { en: "X" } } })).toBeNull();
  });
});

describe("driver trip links", () => {
  it("are public while the rest of /driver needs a login", () => {
    expect(isProtectedPath("/driver")).toBe(true);
    expect(isProtectedPath("/driver/anything")).toBe(true);
    expect(isProtectedPath(`/driver/trip/${"a".repeat(48)}`)).toBe(false);
    expect(isProtectedPath("/drivertrip")).toBe(false);
  });
});
