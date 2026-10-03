import { describe, expect, it } from "vitest";
import {
  bookingsByPackage,
  departureFormValues,
  departureRow,
  isLiveBooking,
  itineraryDayFormValues,
  itineraryDayRow,
  itineraryGaps,
  leadsSettingsFormValues,
  leadsSettingsValue,
  lowestAdultPrice,
  NEW_PACKAGE,
  newDepartureValues,
  newItineraryDayValues,
  newTierValues,
  nextDepartureDate,
  packageFormValues,
  packageRow,
  packagesSettingsFormValues,
  packagesSettingsValue,
  packageStatus,
  seatsBookedByDeparture,
  seatsLeft,
  TIER_PROBLEM_KEYS,
  tierFormValues,
  tierRow,
  tierSaveProblem,
  tiersWith,
  travelSettingsFormValues,
  travelSettingsValue,
} from "@/lib/packages/admin-rows";
import { checkTiers } from "@/lib/packages/pricing";
import { leadsSettingsSchema } from "@/schemas/leads";
import {
  departureFormSchema,
  itineraryDayFormSchema,
  leadsSettingsFormSchema,
  localizedListField,
  packageFiltersSchema,
  packageFormSchema,
  packagesSettingsFormSchema,
  pricingTierFormSchema,
  travelSettingsFormSchema,
} from "@/schemas/package-admin";
import { packagesSettingsSchema, travelSettingsSchema } from "@/schemas/packages";
import type { Tables } from "@/types/database";

const PACKAGE_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_A = "22222222-2222-4222-8222-222222222222";
const MEDIA_B = "33333333-3333-4333-8333-333333333333";
const TIER_ID = "44444444-4444-4444-8444-444444444444";
const DEP_ID = "55555555-5555-4555-8555-555555555555";

const stamps = { created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };

function packageInput(over: Record<string, unknown> = {}) {
  return {
    ...NEW_PACKAGE,
    slug: "braj-84-kos",
    title: { en: "Braj 84 Kos Yatra", hi: "ब्रज 84 कोस यात्रा" },
    summary: { en: "Guided group yatra", hi: "" },
    destinations: "Vrindavan, Govardhan , Vrindavan,Barsana",
    duration_days: 7,
    duration_nights: 6,
    ...over,
  };
}

const packageRowFixture: Tables<"packages"> = {
  id: PACKAGE_ID,
  slug: "braj-84-kos",
  title: { en: "Braj 84 Kos Yatra", hi: "ब्रज 84 कोस यात्रा" },
  summary: { en: "Guided group yatra", hi: null },
  description: null,
  category: "braj",
  destinations: ["Vrindavan", "Govardhan"],
  start_city: null,
  duration_days: 7,
  duration_nights: 6,
  image_id: MEDIA_A,
  gallery_ids: [MEDIA_B],
  highlights: [{ en: "All 12 forests", hi: "सभी 12 वन" }],
  inclusions: [{ en: "AC coach", hi: null }],
  exclusions: [],
  terms: null,
  booking_mode: "book",
  fixed_departures: true,
  min_pax: 1,
  max_pax: 10,
  advance_percent: null,
  tax_bps: 1250,
  sac: "998555",
  rating: null,
  rating_count: 0,
  is_featured: true,
  is_active: true,
  sort_order: 2,
  deleted_at: null,
  ...stamps,
};

describe("packageFormSchema and packageRow", () => {
  it("converts GST % to basis points and lists to arrays", () => {
    const form = packageFormSchema.parse(
      packageInput({ gst_percent: "12.5", advance_percent: "30", image_id: MEDIA_A }),
    );
    const row = packageRow(form);
    expect(row.tax_bps).toBe(1250);
    expect(row.advance_percent).toBe(30);
    expect(row.destinations).toEqual(["Vrindavan", "Govardhan", "Barsana"]);
    expect(row.summary).toEqual({ en: "Guided group yatra", hi: null });
    expect(row.description).toBeNull();
    expect(row.image_id).toBe(MEDIA_A);
  });

  it("leaves the advance empty for the Settings default", () => {
    expect(packageRow(packageFormSchema.parse(packageInput())).advance_percent).toBeNull();
  });

  it("keeps the cover out of the gallery and drops repeats", () => {
    const form = packageFormSchema.parse(
      packageInput({ image_id: MEDIA_A, gallery_ids: [MEDIA_A, MEDIA_B, MEDIA_B] }),
    );
    expect(packageRow(form).gallery_ids).toEqual([MEDIA_B]);
  });

  it("rejects more nights than days and a reversed group size", () => {
    const nights = packageFormSchema.safeParse(packageInput({ duration_days: 2, duration_nights: 3 }));
    expect(nights.success).toBe(false);
    expect(nights.error?.issues[0]).toMatchObject({ path: ["duration_nights"], message: "invalid" });
    const pax = packageFormSchema.safeParse(packageInput({ min_pax: 6, max_pax: 4 }));
    expect(pax.error?.issues[0]).toMatchObject({ path: ["max_pax"], message: "invalid" });
  });

  it("validates slug, GST and SAC with cms.errors keys", () => {
    const bad = packageFormSchema.safeParse(
      packageInput({ slug: "Braj Yatra", gst_percent: "40", sac: "12" }),
    );
    const messages = Object.fromEntries((bad.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
    expect(messages).toMatchObject({ slug: "invalidSlug", gst_percent: "invalid", sac: "invalid" });
  });

  it("round-trips a stored package through the form", () => {
    const values = packageFormValues(packageRowFixture);
    expect(values.gst_percent).toBe("12.5");
    expect(values.advance_percent).toBe("");
    expect(values.destinations).toBe("Vrindavan, Govardhan");
    expect(values.inclusions).toEqual([{ en: "AC coach", hi: "" }]);
    const row = packageRow(packageFormSchema.parse(values));
    expect(row.tax_bps).toBe(1250);
    expect(row.highlights).toEqual(packageRowFixture.highlights);
    expect(row.inclusions).toEqual([{ en: "AC coach", hi: null }]);
    expect(row.gallery_ids).toEqual([MEDIA_B]);
  });

  it("names the status", () => {
    expect(packageStatus(packageRowFixture)).toBe("live");
    expect(packageStatus({ is_active: false, deleted_at: null })).toBe("hidden");
    expect(packageStatus({ is_active: false, deleted_at: "2026-10-01T00:00:00Z" })).toBe("archived");
  });
});

describe("localizedListField", () => {
  it("drops empty rows and keeps Hindi optional", () => {
    expect(
      localizedListField.parse([
        { en: " Breakfast ", hi: " नाश्ता " },
        { en: "", hi: "" },
        { en: "Guide", hi: "" },
      ]),
    ).toEqual([
      { en: "Breakfast", hi: "नाश्ता" },
      { en: "Guide", hi: null },
    ]);
  });

  it("needs the English for a Hindi-only row, on that row", () => {
    const result = localizedListField.safeParse([{ en: "Guide" }, { en: "", hi: "गाइड" }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: [1, "en"], message: "required" });
  });
});

describe("itinerary days", () => {
  it("orders meals and stores empty text as null", () => {
    const form = itineraryDayFormSchema.parse({
      package_id: PACKAGE_ID,
      day_number: "2",
      title: { en: "Govardhan", hi: "" },
      description: { en: "", hi: "" },
      meals: ["dinner", "breakfast"],
      overnight: "  ",
    });
    expect(itineraryDayRow(form)).toEqual({
      package_id: PACKAGE_ID,
      day_number: 2,
      title: { en: "Govardhan", hi: null },
      description: null,
      meals: ["breakfast", "dinner"],
      overnight: null,
    });
  });

  it("round-trips and suggests the next day", () => {
    const day: Tables<"package_itinerary_days"> = {
      id: TIER_ID,
      package_id: PACKAGE_ID,
      day_number: 3,
      title: { en: "Kamyavan", hi: "काम्यवन" },
      description: null,
      meals: ["lunch"],
      overnight: "Kaman",
      ...stamps,
    };
    expect(itineraryDayFormValues(day)).toMatchObject({
      description: { en: "", hi: "" },
      overnight: "Kaman",
    });
    expect(newItineraryDayValues(PACKAGE_ID, [day, { ...day, day_number: 1 }]).day_number).toBe(4);
    expect(newItineraryDayValues(PACKAGE_ID, []).day_number).toBe(1);
  });

  it("finds missing and extra days", () => {
    expect(itineraryGaps([{ day_number: 1 }, { day_number: 3 }, { day_number: 9 }], 4)).toEqual({
      missing: [2, 4],
      extra: [9],
    });
  });
});

describe("pricing tiers", () => {
  it("converts rupees to paise; an empty child price means the adult price", () => {
    const form = pricingTierFormSchema.parse({
      package_id: PACKAGE_ID,
      min_pax: "1",
      max_pax: "4",
      adult_price: "4,499.50",
      child_price: "",
    });
    expect(tierRow(form)).toEqual({
      package_id: PACKAGE_ID,
      min_pax: 1,
      max_pax: 4,
      adult_price_paise: 449950,
      child_price_paise: null,
    });
    expect(pricingTierFormSchema.parse({ ...form, adult_price: "100", child_price: "0" }).child_price).toBe(
      0,
    );
  });

  it("needs an adult price above zero and a range that does not end before it starts", () => {
    const zero = pricingTierFormSchema.safeParse({
      package_id: PACKAGE_ID,
      min_pax: 1,
      max_pax: 2,
      adult_price: "0",
      child_price: "",
    });
    expect(zero.error?.issues[0]).toMatchObject({ path: ["adult_price"], message: "invalidAmount" });
    const reversed = pricingTierFormSchema.safeParse({
      package_id: PACKAGE_ID,
      min_pax: 5,
      max_pax: 2,
      adult_price: "100",
      child_price: "",
    });
    expect(reversed.error?.issues[0]).toMatchObject({ path: ["max_pax"], message: "invalid" });
  });

  it("round-trips paise to rupees", () => {
    const tier: Tables<"package_pricing_tiers"> = {
      id: TIER_ID,
      package_id: PACKAGE_ID,
      min_pax: 3,
      max_pax: 5,
      adult_price_paise: 449900,
      child_price_paise: 250050,
      ...stamps,
    };
    expect(tierFormValues(tier)).toMatchObject({ adult_price: "4499", child_price: "2500.50" });
    expect(tierRow(pricingTierFormSchema.parse(tierFormValues(tier)))).toMatchObject({
      adult_price_paise: 449900,
      child_price_paise: 250050,
    });
  });

  it("refuses overlaps and bad ranges but allows a gap while building", () => {
    const pkg = { minPax: 1, maxPax: 12 };
    const tiers = [
      { id: "a", minPax: 1, maxPax: 2 },
      { id: "b", minPax: 3, maxPax: 5 },
    ];
    expect(tierSaveProblem(tiers, { minPax: 5, maxPax: 12 }, pkg)).toBe("overlap");
    expect(tierSaveProblem(tiers, { minPax: 8, maxPax: 12 }, pkg)).toBeNull();
    // Editing a tier replaces it, so it does not overlap its own old range.
    expect(tierSaveProblem(tiers, { id: "b", minPax: 3, maxPax: 12 }, pkg)).toBeNull();
    expect(tierSaveProblem([], { minPax: 6, maxPax: 4 }, pkg)).toBe("range");
    expect(tiersWith(tiers, { id: "a", minPax: 1, maxPax: 1 })).toHaveLength(2);
  });

  it("maps every tier problem to a message key", () => {
    expect(TIER_PROBLEM_KEYS).toEqual({
      empty: "tiersEmpty",
      overlap: "tiersOverlap",
      gap: "tiersGap",
      range: "tiersRange",
    });
    expect(TIER_PROBLEM_KEYS[checkTiers([{ minPax: 1, maxPax: 4 }], 1, 10)!]).toBe("tiersGap");
    expect(TIER_PROBLEM_KEYS[checkTiers([], 1, 10)!]).toBe("tiersEmpty");
  });

  it("suggests the next range and the from-price", () => {
    const pkg = { min_pax: 2, max_pax: 12 };
    expect(newTierValues(PACKAGE_ID, [], pkg)).toMatchObject({ min_pax: 2, max_pax: 12 });
    expect(newTierValues(PACKAGE_ID, [{ max_pax: 5 }], pkg)).toMatchObject({ min_pax: 6, max_pax: 12 });
    expect(lowestAdultPrice([{ adult_price_paise: 449900 }, { adult_price_paise: 379900 }])).toBe(379900);
    expect(lowestAdultPrice([])).toBeNull();
  });
});

describe("departures and seats", () => {
  it("parses seats, supplement and note", () => {
    const form = departureFormSchema.parse({
      package_id: PACKAGE_ID,
      start_date: "2026-11-14",
      seats_total: "",
      supplement: "1500",
      note: { en: "Holi special", hi: "" },
      is_active: true,
    });
    expect(departureRow(form)).toEqual({
      package_id: PACKAGE_ID,
      start_date: "2026-11-14",
      seats_total: null,
      supplement_paise: 150000,
      note: { en: "Holi special", hi: null },
      is_active: true,
    });
  });

  it("rejects a bad date and zero seats", () => {
    const bad = departureFormSchema.safeParse({
      package_id: PACKAGE_ID,
      start_date: "14/11/2026",
      seats_total: "0",
      supplement: "",
      note: null,
      is_active: true,
    });
    const paths = (bad.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["start_date", "seats_total"]));
  });

  it("round-trips and carries the last seat count into a new date", () => {
    const dep: Tables<"package_departures"> = {
      id: DEP_ID,
      package_id: PACKAGE_ID,
      start_date: "2026-12-01",
      seats_total: 30,
      supplement_paise: 0,
      note: null,
      is_active: true,
      ...stamps,
    };
    expect(departureFormValues(dep)).toMatchObject({
      seats_total: "30",
      supplement: "0",
      note: { en: "", hi: "" },
    });
    expect(newDepartureValues(PACKAGE_ID, 30).seats_total).toBe("30");
    expect(newDepartureValues(PACKAGE_ID).seats_total).toBe("");
  });

  it("counts confirmed bookings and unexpired holds only", () => {
    const now = Date.parse("2026-10-02T10:00:00Z");
    expect(isLiveBooking({ status: "confirmed", expires_at: null }, now)).toBe(true);
    expect(isLiveBooking({ status: "pending_payment", expires_at: "2026-10-02T10:05:00Z" }, now)).toBe(true);
    expect(isLiveBooking({ status: "pending_payment", expires_at: "2026-10-02T09:55:00Z" }, now)).toBe(false);
    expect(isLiveBooking({ status: "cancelled", expires_at: null }, now)).toBe(false);
  });

  it("sums travellers per departure and bookings per package", () => {
    const live = [
      { package_id: "p1", departure_id: "d1", pax: 3 },
      { package_id: "p1", departure_id: "d1", pax: 2 },
      { package_id: "p1", departure_id: null, pax: 4 },
      { package_id: "p2", departure_id: "d2", pax: 1 },
    ];
    expect(Object.fromEntries(seatsBookedByDeparture(live))).toEqual({ d1: 5, d2: 1 });
    expect(Object.fromEntries(bookingsByPackage(live))).toEqual({ p1: 3, p2: 1 });
  });

  it("prefers the database's seats left, else counts here", () => {
    expect(seatsLeft(null, 5, undefined)).toBeNull();
    expect(seatsLeft(30, 5, 24)).toBe(24);
    expect(seatsLeft(30, 5, undefined)).toBe(25);
    expect(seatsLeft(4, 6, undefined)).toBe(0);
  });

  it("finds the next active departure from today", () => {
    expect(
      nextDepartureDate(
        [
          { start_date: "2026-09-30", is_active: true },
          { start_date: "2026-11-01", is_active: false },
          { start_date: "2026-12-01", is_active: true },
          { start_date: "2026-10-20", is_active: true },
        ],
        "2026-10-02",
      ),
    ).toBe("2026-10-20");
    expect(nextDepartureDate([], "2026-10-02")).toBeNull();
  });
});

describe("list filters", () => {
  it("drops invalid values", () => {
    expect(
      packageFiltersSchema.parse({ status: "gone", mode: "book", category: "Braj!", q: " agra " }),
    ).toEqual({
      status: undefined,
      mode: "book",
      category: undefined,
      q: "agra",
    });
  });
});

describe("settings forms", () => {
  it("round-trips packages.defaults", () => {
    const stored = packagesSettingsSchema.parse({});
    const value = packagesSettingsValue(packagesSettingsFormSchema.parse(packagesSettingsFormValues(stored)));
    expect(packagesSettingsSchema.parse(value)).toEqual(value);
    expect(value.advance_percent).toBe(stored.advance_percent);
  });

  it("stores the quote GST as basis points and lists one per line", () => {
    const form = leadsSettingsFormSchema.parse({
      ...leadsSettingsFormValues(leadsSettingsSchema.parse({})),
      quote_gst_percent: "18",
      sources: "website\n Walk In \n\nwebsite\nreferral",
      lost_reasons: "Price too high\nBooked elsewhere\n",
    });
    const value = leadsSettingsValue(form);
    expect(value.quote_tax_bps).toBe(1800);
    expect(value.sources).toEqual(["website", "walk_in", "referral"]);
    expect(value.lost_reasons).toEqual(["Price too high", "Booked elsewhere"]);
    expect(leadsSettingsSchema.safeParse(value).success).toBe(true);
    expect(leadsSettingsFormValues(value).quote_gst_percent).toBe("18");
  });

  it("needs at least one valid source and lost reason", () => {
    const base = leadsSettingsFormValues(leadsSettingsSchema.parse({}));
    const empty = leadsSettingsFormSchema.safeParse({ ...base, sources: " \n ", lost_reasons: "x" });
    const messages = Object.fromEntries(
      (empty.error?.issues ?? []).map((i) => [i.path.join("."), i.message]),
    );
    expect(messages).toEqual({ sources: "required", lost_reasons: "invalid" });
    expect(leadsSettingsFormSchema.safeParse({ ...base, sources: "web site!" }).success).toBe(false);
  });

  it("keeps the travel provider as stored and splits classes", () => {
    const stored = travelSettingsSchema.parse({});
    const form = travelSettingsFormSchema.parse({
      ...travelSettingsFormValues(stored),
      bus_classes: "seater, sleeper, seater",
    });
    const value = travelSettingsValue(form, "manual");
    expect(value.provider).toBe("manual");
    expect(value.classes.bus).toEqual(["seater", "sleeper"]);
    expect(value.classes.train).toEqual(stored.classes.train);
    expect(travelSettingsSchema.parse(value)).toEqual(value);
    expect(travelSettingsFormSchema.safeParse({ ...form, flight_classes: " " }).success).toBe(false);
  });
});
