import { describe, expect, it } from "vitest";
import { indexCalendar } from "@/lib/availability/engine";
import { searchHotels, stayFromSearch, type SearchContext } from "@/lib/hotels/search";
import type { CatalogHotel, CatalogPlan, CatalogRoom, HotelCatalog } from "@/lib/hotels/types";
import { DEFAULT_GST_SLABS } from "@/lib/pricing/tax";
import { hotelSearchDefaultsSchema, parseHotelSearch } from "@/schemas/hotels";

const defaults = hotelSearchDefaultsSchema.parse({ page_size: 4 });
const TODAY = "2026-10-01";

function room(id: string, overrides: Partial<CatalogRoom> = {}): CatalogRoom {
  return {
    id,
    name: { en: id },
    description: null,
    bedType: null,
    sizeSqft: null,
    baseOccupancy: 2,
    maxAdults: 3,
    maxChildren: 2,
    maxOccupancy: 4,
    totalUnits: 3,
    amenityIds: [],
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

function plan(id: string, roomId: string, price: number, overrides: Partial<CatalogPlan> = {}): CatalogPlan {
  return {
    id,
    roomId,
    name: { en: id },
    inclusions: [],
    mealPlan: "room_only",
    isRefundable: false,
    cancellationRules: [],
    basePricePaise: price,
    extraAdultPaise: 0,
    extraChildPaise: 0,
    minStay: 1,
    maxStay: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

function hotel(slug: string, overrides: Partial<CatalogHotel> = {}, price = 200_000): CatalogHotel {
  const r = room(`${slug}-room`);
  return {
    id: slug,
    slug,
    name: { en: slug.replace(/-/g, " "), hi: null },
    summary: null,
    description: null,
    propertyType: "hotel",
    starRating: 3,
    cityId: "vrindavan",
    areaId: null,
    address: null,
    lat: 27.58,
    lng: 77.7,
    checkInTime: "12:00",
    checkOutTime: "11:00",
    highlights: [],
    foodDining: null,
    policies: {
      unmarried_couples_allowed: true,
      bachelors_allowed: true,
      local_ids_allowed: true,
      pets_allowed: false,
      id_proofs: [],
      rules: [],
    },
    isCoupleFriendly: false,
    isFeatured: false,
    isSponsored: false,
    payAtHotel: false,
    ratingAvg: 4,
    ratingCount: 10,
    sortOrder: 0,
    seo: {},
    amenityIds: [],
    images: [],
    rooms: [r],
    plans: [plan(`${slug}-ep`, r.id, price)],
    rules: [],
    ...overrides,
  };
}

const catalog: HotelCatalog = {
  hotels: [
    hotel(
      "radha-kunj",
      { ratingAvg: 4.6, ratingCount: 50, isCoupleFriendly: true, amenityIds: ["a-wifi"] },
      300_000,
    ),
    hotel("yamuna-view", { ratingAvg: 3.8, ratingCount: 200, starRating: 4 }, 150_000),
    hotel("gokul-ashram", { propertyType: "ashram", ratingAvg: 4.2, lat: 27.5, lng: 77.6 }, 80_000),
    hotel("mathura-inn", { cityId: "mathura", ratingAvg: 4.9, isSponsored: true }, 500_000),
  ],
  amenities: [{ id: "a-wifi", slug: "wifi", name: { en: "Wi-Fi" }, icon: "wifi", grouping: "general" }],
  cities: [
    { id: "vrindavan", slug: "vrindavan", name: { en: "Vrindavan", hi: "वृंदावन" }, lat: null, lng: null },
    { id: "mathura", slug: "mathura", name: { en: "Mathura" }, lat: null, lng: null },
  ],
  areas: [
    {
      id: "bb",
      cityId: "vrindavan",
      slug: "banke-bihari",
      name: { en: "Banke Bihari Temple" },
      kind: "temple",
      lat: 27.5803,
      lng: 77.7006,
    },
  ],
};

const ctx = (overrides: Partial<SearchContext> = {}): SearchContext => ({
  calendar: indexCalendar([], [], []),
  gstSlabs: DEFAULT_GST_SLABS,
  defaults,
  today: TODAY,
  ...overrides,
});

const slugs = (raw: Record<string, string>, c = ctx()) =>
  searchHotels(catalog, parseHotelSearch(raw), c).results.map((r) => r.hotel.slug);

describe("parseHotelSearch", () => {
  it("drops invalid values one by one instead of failing", () => {
    const s = parseHotelSearch({
      rooms: "99",
      sort: "nope",
      stars: "3,x",
      checkin: "2026-02-30",
      adults: "3",
    });
    expect(s.rooms).toBe(1);
    expect(s.sort).toBe("popular");
    expect(s.stars).toBeUndefined();
    expect(s.checkin).toBeUndefined();
    expect(s.adults).toBe(3);
  });

  it("reads csv lists and flags", () => {
    const s = parseHotelSearch({ stars: "3,4", type: "hotel,ashram", couple: "1", amenities: "wifi" });
    expect(s.stars).toEqual([3, 4]);
    expect(s.type).toEqual(["hotel", "ashram"]);
    expect(s.couple).toBe(true);
    expect(s.amenities).toEqual(["wifi"]);
  });
});

describe("stayFromSearch", () => {
  const s = (raw: Record<string, string>) => stayFromSearch(parseHotelSearch(raw), defaults, TODAY);
  it("needs both dates, in the future, within max nights", () => {
    expect(s({ checkin: "2026-10-05" })).toBeNull();
    expect(s({ checkin: "2026-09-30", checkout: "2026-10-02" })).toBeNull();
    expect(s({ checkin: "2026-10-05", checkout: "2026-10-05" })).toBeNull();
    expect(s({ checkin: "2026-10-05", checkout: "2026-12-05" })).toBeNull();
    expect(s({ checkin: "2026-10-05", checkout: "2026-10-07", rooms: "2", adults: "1" })).toMatchObject({
      rooms: 2,
      adults: 2, // every room needs an adult
    });
  });
});

describe("searchHotels", () => {
  it("sorts popular with sponsored first", () => {
    expect(slugs({})[0]).toBe("mathura-inn");
  });

  it("sorts by price both ways", () => {
    expect(slugs({ sort: "price_asc" })).toEqual([
      "gokul-ashram",
      "yamuna-view",
      "radha-kunj",
      "mathura-inn",
    ]);
    expect(slugs({ sort: "price_desc" })).toEqual([
      "mathura-inn",
      "radha-kunj",
      "yamuna-view",
      "gokul-ashram",
    ]);
  });

  it("puts 4+ rated hotels first, cheapest first, for value sort", () => {
    expect(slugs({ sort: "value" })).toEqual(["gokul-ashram", "radha-kunj", "mathura-inn", "yamuna-view"]);
  });

  it("filters by city, text, type, stars, rating, couple and amenities", () => {
    expect(slugs({ city: "mathura" })).toEqual(["mathura-inn"]);
    expect(slugs({ q: "वृंदावन", sort: "price_asc" })).toEqual(["gokul-ashram", "yamuna-view", "radha-kunj"]);
    expect(slugs({ q: "YAMUNA" })).toEqual(["yamuna-view"]);
    expect(slugs({ type: "ashram" })).toEqual(["gokul-ashram"]);
    expect(slugs({ stars: "4" })).toEqual(["yamuna-view"]);
    expect(slugs({ rating: "4.5", sort: "rating" })).toEqual(["mathura-inn", "radha-kunj"]);
    expect(slugs({ couple: "1" })).toEqual(["radha-kunj"]);
    expect(slugs({ amenities: "wifi" })).toEqual(["radha-kunj"]);
  });

  it("filters by nightly price in rupees", () => {
    expect(slugs({ price_min: "1000", price_max: "3000", sort: "price_asc" })).toEqual([
      "yamuna-view",
      "radha-kunj",
    ]);
  });

  it("filters by distance from a landmark", () => {
    const result = searchHotels(
      catalog,
      parseHotelSearch({ landmark: "banke-bihari", within: "1000" }),
      ctx(),
    );
    expect(result.results.map((r) => r.hotel.slug).sort()).toEqual([
      "mathura-inn",
      "radha-kunj",
      "yamuna-view",
    ]);
    expect(result.results[0].distanceM).toBeLessThan(1000);
    expect(result.landmark?.slug).toBe("banke-bihari");
  });

  it("prices the stay and moves sold-out hotels last", () => {
    const calendar = indexCalendar(
      [
        {
          roomId: "gokul-ashram-room",
          date: "2026-10-05",
          units: 0,
          soldUnits: 0,
          isClosed: false,
          minStay: null,
        },
      ],
      [],
      [],
    );
    const result = searchHotels(
      catalog,
      parseHotelSearch({ checkin: "2026-10-05", checkout: "2026-10-07", sort: "price_asc" }),
      ctx({ calendar }),
    );
    const last = result.results.at(-1)!;
    expect(last.hotel.slug).toBe("gokul-ashram");
    expect(last.unavailable).toBe("sold_out");
    const first = result.results[0];
    expect(first.offer?.nights).toHaveLength(2);
    expect(first.offer?.totalPaise).toBe(2 * 150_000 + 2 * 7_500); // 5% GST slab
  });

  it("drops hotels that can't host the party", () => {
    expect(slugs({ checkin: "2026-10-05", checkout: "2026-10-06", adults: "5" })).toEqual([]);
  });

  it("keeps only plans that match breakfast and free cancellation filters", () => {
    const withBreakfast: HotelCatalog = {
      ...catalog,
      hotels: catalog.hotels.map((h) =>
        h.slug === "yamuna-view"
          ? {
              ...h,
              plans: [
                ...h.plans,
                plan("yv-cp", "yamuna-view-room", 180_000, {
                  mealPlan: "breakfast",
                  isRefundable: true,
                  cancellationRules: [{ hours_before: 24, refund_percent: 100 }],
                }),
              ],
            }
          : h,
      ),
    };
    const result = searchHotels(withBreakfast, parseHotelSearch({ breakfast: "1", free_cancel: "1" }), ctx());
    expect(result.results.map((r) => [r.hotel.slug, r.displayPaise])).toEqual([["yamuna-view", 180_000]]);
  });

  it("paginates with the configured page size", () => {
    const many: HotelCatalog = {
      ...catalog,
      hotels: Array.from({ length: 9 }, (_, i) => hotel(`h-${i}`, { sortOrder: i, ratingCount: 0 })),
    };
    const page3 = searchHotels(many, parseHotelSearch({ page: "3" }), ctx());
    expect(page3).toMatchObject({ total: 9, page: 3, pageCount: 3 });
    expect(page3.results.map((r) => r.hotel.slug)).toEqual(["h-8"]);
    expect(searchHotels(many, parseHotelSearch({ page: "50" }), ctx()).page).toBe(3);
  });
});
