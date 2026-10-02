import { describe, expect, it, vi } from "vitest";
import { rideResultOffers, rideSearchOptions } from "@/lib/rides/page-data";
import type { RideCatalog } from "@/lib/rides/queries";
import { planRide } from "@/lib/rides/search";
import {
  canRateRide,
  geoProblem,
  groupRidePoints,
  hourOptions,
  rideAllowsCancel,
  rideDriverActions,
  rideLineKey,
  ridePlanErrorValues,
  rideSearchQuery,
  rideSearchSubmitted,
  rideSnapshot,
  rideStatusTone,
  roundCoord,
  showRideOtp,
  type RidePointOption,
  type RideStatus,
} from "@/lib/rides/ui";
import { parseRideSearch, rideSettingsSchema } from "@/schemas/rides";

vi.mock("server-only", () => ({}));

describe("rideSearchQuery", () => {
  it("keeps only the keys a point-to-point ride uses", () => {
    expect(
      rideSearchQuery({
        v: "bike",
        mode: "point_to_point",
        from: "iskcon",
        to: "banke-bihari",
        hrs: 3,
        pax: 1,
      }),
    ).toEqual({ v: "bike", mode: "point_to_point", from: "iskcon", to: "banke-bihari", at: "now", pax: "1" });
  });

  it("keeps hours and drops the drop for hourly rides", () => {
    expect(
      rideSearchQuery({ mode: "hourly", from: "iskcon", to: "banke-bihari", hrs: 3, at: "2026-12-01T09:00" }),
    ).toEqual({ mode: "hourly", from: "iskcon", hrs: "3", at: "2026-12-01T09:00", pax: "1" });
  });

  it("writes rounded coordinates only for 'here'", () => {
    const q = rideSearchQuery({ from: "here", flat: 27.5806123456, flng: 77.70061234, to: "iskcon" });
    expect(q.from).toBe("here");
    expect(q.flat).toBe("27.58061");
    expect(q.flng).toBe("77.70061");
    expect(q.tlat).toBeUndefined();
    expect(rideSearchQuery({ from: "iskcon", flat: 1, flng: 2 }).flat).toBeUndefined();
  });

  it("round-trips through the URL parser", () => {
    const query = rideSearchQuery({
      v: "e-rickshaw",
      mode: "point_to_point",
      from: "here",
      flat: 27.58,
      flng: 77.69,
      to: "here",
      tlat: 27.5,
      tlng: 77.6,
      at: "2026-12-01T09:00",
      pax: 3,
    });
    expect(parseRideSearch(query)).toMatchObject({
      v: "e-rickshaw",
      from: "here",
      flat: 27.58,
      to: "here",
      tlng: 77.6,
      at: "2026-12-01T09:00",
      pax: 3,
    });
  });

  it("rounds coordinates to five decimals", () => {
    expect(roundCoord(27.123456789)).toBe(27.12346);
  });
});

describe("rideSearchSubmitted", () => {
  it("counts a search once it names a pickup", () => {
    expect(rideSearchSubmitted({})).toBe(false);
    expect(rideSearchSubmitted({ v: "bike" })).toBe(false);
    expect(rideSearchSubmitted({ from: "" })).toBe(false);
    expect(rideSearchSubmitted({ from: "iskcon" })).toBe(true);
    expect(rideSearchSubmitted({ from: ["here", "x"] })).toBe(true);
  });
});

describe("groupRidePoints", () => {
  const points: RidePointOption[] = [
    { slug: "iskcon", name: "ISKCON Temple", kind: "temple", isPopular: true, zone: "vrindavan" },
    { slug: "nidhivan", name: "Nidhivan", kind: "temple", isPopular: false, zone: "vrindavan" },
    { slug: "janmabhoomi", name: "Krishna Janmabhoomi", kind: "temple", isPopular: true, zone: "mathura" },
    { slug: "mathura-bus", name: "Mathura bus stand", kind: "station", isPopular: false, zone: "mathura" },
  ];
  const zones = [
    { slug: "vrindavan", name: "Vrindavan" },
    { slug: "mathura", name: "Mathura" },
    { slug: "barsana", name: "Barsana" },
  ];

  it("puts popular landmarks first, then each zone in order, skipping empty zones", () => {
    const groups = groupRidePoints(points, zones);
    expect(groups.map((g) => g.key)).toEqual(["popular", "vrindavan", "mathura"]);
    expect(groups[0].label).toBeNull();
    expect(groups[0].points.map((p) => p.slug)).toEqual(["iskcon", "janmabhoomi"]);
    expect(groups[1].points.map((p) => p.slug)).toEqual(["nidhivan"]);
  });

  it("filters by name or zone and drops the popular group", () => {
    expect(groupRidePoints(points, zones, "nidhi").flatMap((g) => g.points.map((p) => p.slug))).toEqual([
      "nidhivan",
    ]);
    const mathura = groupRidePoints(points, zones, "mathura");
    expect(mathura.map((g) => g.key)).toEqual(["mathura"]);
    expect(mathura[0].points).toHaveLength(2);
  });
});

describe("message helpers", () => {
  it("passes the settings limits to error messages", () => {
    const settings = rideSettingsSchema.parse({});
    expect(ridePlanErrorValues(settings)).toEqual({ minutes: 10, days: 7, km: 40, hours: 12 });
  });

  it("maps geolocation errors", () => {
    expect(geoProblem(1)).toBe("denied");
    expect(geoProblem(2)).toBe("unavailable");
    expect(geoProblem(3)).toBe("timeout");
    expect(geoProblem("unsupported")).toBe("unsupported");
  });

  it("labels fare lines", () => {
    expect(rideLineKey("fare")).toBe("fare");
    expect(rideLineKey("surcharge:night")).toBe("night");
    expect(rideLineKey("fee:convenience")).toBe("fee");
    expect(rideLineKey("something")).toBe("other");
  });

  it("offers one to max hours", () => {
    expect(hourOptions(3)).toEqual([1, 2, 3]);
    expect(hourOptions(0)).toEqual([1]);
  });
});

describe("ride status", () => {
  const all: RideStatus[] = [
    "awaiting_payment",
    "requested",
    "assigned",
    "en_route",
    "arrived",
    "picked_up",
    "completed",
    "cancelled",
    "no_show",
  ];

  it("gives every status a tone", () => {
    for (const s of all) expect(rideStatusTone(s)).toBeTruthy();
    expect(rideStatusTone("completed")).toBe("success");
    expect(rideStatusTone("no_show")).toBe("danger");
  });

  it("shows the OTP only for confirmed rides before pickup", () => {
    expect(showRideOtp("confirmed", "requested", "1234")).toBe(true);
    expect(showRideOtp("confirmed", "arrived", "1234")).toBe(true);
    expect(showRideOtp("confirmed", "picked_up", "1234")).toBe(false);
    expect(showRideOtp("pending_payment", "awaiting_payment", "1234")).toBe(false);
    expect(showRideOtp("confirmed", "assigned", null)).toBe(false);
    expect(showRideOtp("confirmed", null, "1234")).toBe(false);
  });

  it("allows cancelling until the driver sets off", () => {
    expect(all.filter((s) => rideAllowsCancel(s))).toEqual(["awaiting_payment", "requested", "assigned"]);
    expect(rideAllowsCancel(null)).toBe(true);
  });

  it("asks for a rating once a completed ride has none", () => {
    expect(canRateRide("completed", null)).toBe(true);
    expect(canRateRide("completed", "2026-12-01T10:00:00Z")).toBe(false);
    expect(canRateRide("picked_up", null)).toBe(false);
  });

  it("builds driver buttons with the OTP at pickup", () => {
    expect(rideDriverActions(["picked_up", "no_show"], true)).toEqual([
      { status: "picked_up", primary: true, needsOtp: true },
      { status: "no_show", primary: false, needsOtp: false },
    ]);
    expect(rideDriverActions(["picked_up"], false)[0].needsOtp).toBe(false);
  });
});

describe("rideSnapshot", () => {
  it("reads the snapshot written at booking", () => {
    const snap = rideSnapshot({
      ride: {
        mode: "point_to_point",
        label: "Bike · ISKCON → Banke Bihari",
        vehicleType: { id: "t", key: "bike", name: { en: "Bike", hi: "बाइक" }, icon: "bike" },
        zone: { slug: "vrindavan", name: { en: "Vrindavan" } },
        from: { slug: "iskcon", name: { en: "ISKCON" } },
        to: { slug: null, name: { en: "Current location", hi: "वर्तमान स्थान" } },
        hours: null,
        pickupAt: "2026-12-01T04:45:00.000Z",
        isNow: true,
        distanceKm: 3.2,
        durationMinutes: 11,
        instantBook: true,
      },
      trip: { label: "x", route: "y", vehicle: "Bike" },
      terms: { mode: "point_to_point", includedKm: 2, hours: null, extraKmPaise: 800 },
      cancellationRules: [{ hours_before: 1, refund_percent: 100 }],
    });
    expect(snap?.ride.vehicleType.key).toBe("bike");
    expect(snap?.ride.to?.slug).toBeNull();
    expect(snap?.cancellationRules).toHaveLength(1);
  });

  it("ignores hotel and cab snapshots", () => {
    expect(rideSnapshot({ hotel: { name: { en: "X" } } })).toBeNull();
    expect(rideSnapshot({ trip: { type: "one_way", pickupAt: "2026-12-01T04:45:00Z" } })).toBeNull();
  });
});

describe("page data", () => {
  const settings = rideSettingsSchema.parse({});
  const now = new Date("2026-12-01T04:30:00Z"); // 10:00 India time
  const fare = {
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
  };
  const catalog: RideCatalog = {
    types: [
      {
        id: "t-bike",
        key: "bike",
        serviceSlug: "bike",
        name: { en: "Bike", hi: "बाइक" },
        description: { en: "Quick" },
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
        instantBook: false,
        taxBps: 0,
      },
    ],
    zones: [
      { id: "z-vrn", slug: "vrindavan", name: { en: "Vrindavan" }, lat: 27.58, lng: 77.69, radiusKm: 8 },
    ],
    points: [
      {
        id: "p-isk",
        zoneId: "z-vrn",
        slug: "iskcon",
        name: { en: "ISKCON Temple", hi: "इस्कॉन मंदिर" },
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
        isPopular: false,
      },
      {
        id: "p-orphan",
        zoneId: "z-gone",
        slug: "orphan",
        name: { en: "Orphan" },
        kind: "landmark",
        lat: 27.5,
        lng: 77.5,
        isPopular: false,
      },
    ],
    fares: [
      { ...fare, zoneId: "z-vrn", vehicleTypeId: "t-bike", mode: "point_to_point" },
      { ...fare, zoneId: "z-vrn", vehicleTypeId: "t-erik", mode: "point_to_point" },
    ],
  };

  it("builds localized form options and the booking window", () => {
    const options = rideSearchOptions(catalog, settings, "hi", now);
    expect(options.types.map((t) => [t.key, t.name, t.instantBook])).toEqual([
      ["bike", "बाइक", true],
      ["e-rickshaw", "E-Rickshaw", false],
    ]);
    expect(options.points.map((p) => p.slug)).toEqual(["iskcon", "banke-bihari"]);
    expect(options.points[0]).toMatchObject({ name: "इस्कॉन मंदिर", zone: "vrindavan" });
    expect(options.maxPassengers).toBe(4);
    expect(options.maxHours).toBe(12);
    expect(options.minAt).toBe("2026-12-01T10:15");
    expect(options.maxAt).toBe("2026-12-08T10:00");
  });

  it("prices one card per vehicle type, the chosen one first", () => {
    const planned = planRide(
      parseRideSearch({ from: "iskcon", to: "banke-bihari", pax: "2" }),
      catalog,
      settings,
      now,
    );
    if (!planned.ok) throw new Error(planned.error);
    const offers = rideResultOffers(planned.plan, catalog, settings, "en", "e-rickshaw");
    expect(offers.map((o) => o.key)).toEqual(["e-rickshaw", "bike"]);
    expect(offers.find((o) => o.key === "bike")?.fits).toBe(false);
    expect(offers.every((o) => o.totalPaise > 0)).toBe(true);
    // Bike carries 5% GST on the same base fare.
    const bike = offers.find((o) => o.key === "bike")?.totalPaise ?? 0;
    const erik = offers.find((o) => o.key === "e-rickshaw")?.totalPaise ?? 0;
    expect(bike).toBeGreaterThan(erik);
    expect(rideResultOffers(planned.plan, catalog, settings, "en").map((o) => o.key)).toEqual([
      "bike",
      "e-rickshaw",
    ]);
    // No hourly fares in this zone: no cards.
    const hourly = planRide(
      parseRideSearch({ mode: "hourly", from: "iskcon", hrs: "2" }),
      catalog,
      settings,
      now,
    );
    if (!hourly.ok) throw new Error(hourly.error);
    expect(rideResultOffers(hourly.plan, catalog, settings, "en")).toEqual([]);
  });
});
