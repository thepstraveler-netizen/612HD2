import {
  bestOffer,
  offersFreeCancellation,
  startingPrice,
  type CalendarIndex,
  type RatePlan,
  type StayQuote,
  type StayRequest,
  type Unavailable,
} from "@/lib/availability/engine";
import { daysBetween, type IsoDate } from "@/lib/dates";
import { distanceMeters } from "@/lib/geo";
import type { GstSlab } from "@/lib/pricing/tax";
import type { HotelSearch, HotelSearchDefaults } from "@/schemas/hotels";
import type { CatalogArea, CatalogHotel, HotelCatalog } from "./types";

/**
 * Hotel search: filter, price, sort and paginate the published catalog for
 * one query. Pure, so the listing page and its tests share it exactly.
 */

export type HotelResult = {
  hotel: CatalogHotel;
  /** Cheapest bookable offer for the dates, when dates are given and it fits. */
  offer: StayQuote | null;
  /** Why no offer fits the dates (sold out, min stay, …). */
  unavailable: Unavailable | null;
  /** Price per room per night shown on the card: the offer's average, or the lowest base price. */
  displayPaise: number | null;
  /** Metres from the chosen landmark, when one is chosen. */
  distanceM: number | null;
};

export type HotelSearchResult = {
  results: HotelResult[];
  total: number;
  page: number;
  pageCount: number;
  /** The stay that was priced, or null when no (valid) dates were given. */
  stay: StayRequest | null;
  landmark: CatalogArea | null;
};

export type SearchContext = {
  calendar: CalendarIndex;
  gstSlabs: readonly GstSlab[];
  defaults: HotelSearchDefaults;
  today: IsoDate;
};

/** A stay from the query when the dates are usable, else null (show "from" prices). */
export function stayFromSearch(
  search: HotelSearch,
  defaults: HotelSearchDefaults,
  today: IsoDate,
): StayRequest | null {
  const { checkin, checkout } = search;
  if (!checkin || !checkout || checkin < today) return null;
  const nights = daysBetween(checkin, checkout);
  if (nights < 1 || nights > defaults.max_nights) return null;
  const rooms = Math.min(search.rooms, defaults.max_rooms);
  return {
    checkIn: checkin,
    checkOut: checkout,
    rooms,
    adults: Math.max(search.adults, rooms),
    children: search.children,
  };
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("en-IN").normalize("NFKD").replace(/\p{M}/gu, "").trim();
}

function matchesText(hotel: CatalogHotel, catalog: HotelCatalog, q: string): boolean {
  const needle = normalize(q);
  if (!needle) return true;
  const city = catalog.cities.find((c) => c.id === hotel.cityId);
  const area = catalog.areas.find((a) => a.id === hotel.areaId);
  const haystack = [
    hotel.name.en,
    hotel.name.hi,
    city?.name.en,
    city?.name.hi,
    area?.name.en,
    area?.name.hi,
    hotel.address,
  ]
    .filter(Boolean)
    .map((s) => normalize(s as string));
  return haystack.some((s) => s.includes(needle));
}

function planFilter(search: HotelSearch): (plan: RatePlan) => boolean {
  return (plan) =>
    (!search.breakfast || plan.mealPlan !== "room_only") &&
    (!search.free_cancel || offersFreeCancellation(plan));
}

const popularity = (h: CatalogHotel) =>
  (h.isSponsored ? 4 : 0) + (h.isFeatured ? 2 : 0);

function compare(a: HotelResult, b: HotelResult, sort: HotelSearch["sort"]): number {
  // Hotels that can't take the stay always go last.
  const avail = Number(a.unavailable !== null) - Number(b.unavailable !== null);
  if (avail) return avail;
  const price = (r: HotelResult) => r.displayPaise ?? Number.MAX_SAFE_INTEGER;
  const rating = (r: HotelResult) => r.hotel.ratingAvg ?? 0;
  switch (sort) {
    case "price_asc":
      return price(a) - price(b);
    case "price_desc":
      return (b.displayPaise ?? -1) - (a.displayPaise ?? -1);
    case "rating":
      return rating(b) - rating(a) || b.hotel.ratingCount - a.hotel.ratingCount;
    case "value": {
      // "Lowest price & best rated": 4★+ guest rating first, cheapest first within each group.
      const tier = (r: HotelResult) => (rating(r) >= 4 ? 0 : 1);
      return tier(a) - tier(b) || price(a) - price(b) || rating(b) - rating(a);
    }
    case "popular":
      return (
        popularity(b.hotel) - popularity(a.hotel) ||
        b.hotel.ratingCount - a.hotel.ratingCount ||
        a.hotel.sortOrder - b.hotel.sortOrder
      );
  }
}

export function searchHotels(catalog: HotelCatalog, search: HotelSearch, ctx: SearchContext): HotelSearchResult {
  const stay = stayFromSearch(search, ctx.defaults, ctx.today);
  const city = search.city ? catalog.cities.find((c) => c.slug === search.city) : undefined;
  const landmark = search.landmark ? (catalog.areas.find((a) => a.slug === search.landmark) ?? null) : null;
  const amenityIds = (search.amenities ?? [])
    .map((slug) => catalog.amenities.find((a) => a.slug === slug)?.id)
    .filter((id): id is string => Boolean(id));
  const filterPlan = planFilter(search);
  const minPaise = search.price_min !== undefined ? search.price_min * 100 : null;
  const maxPaise = search.price_max !== undefined ? search.price_max * 100 : null;
  const priceFiltered = minPaise !== null || maxPaise !== null;

  const results: HotelResult[] = [];
  for (const hotel of catalog.hotels) {
    if (search.city && (!city || hotel.cityId !== city.id)) continue;
    if (search.q && !matchesText(hotel, catalog, search.q)) continue;
    if (search.stars?.length && !search.stars.includes(hotel.starRating)) continue;
    if (search.rating !== undefined && (hotel.ratingAvg ?? 0) < search.rating) continue;
    if (search.type?.length && !search.type.includes(hotel.propertyType)) continue;
    if (search.couple && !hotel.isCoupleFriendly) continue;
    if (amenityIds.some((id) => !hotel.amenityIds.includes(id))) continue;

    let distanceM: number | null = null;
    if (landmark?.lat != null && landmark.lng != null) {
      if (hotel.lat === null || hotel.lng === null) continue;
      distanceM = distanceMeters({ lat: landmark.lat, lng: landmark.lng }, { lat: hotel.lat, lng: hotel.lng });
      if (search.within !== undefined && distanceM > search.within) continue;
    }

    const plans = hotel.plans.filter(filterPlan);
    if (plans.length === 0) continue;

    let offer: StayQuote | null = null;
    let unavailable: Unavailable | null = null;
    let displayPaise: number | null;
    if (stay) {
      const quote = bestOffer(hotel.rooms, plans, stay, ctx.calendar, ctx.gstSlabs);
      if (quote.ok) {
        offer = quote;
        displayPaise = quote.avgNightlyPaise;
      } else {
        // A party the property can't host at all isn't a result; anything else shows as unavailable.
        if (quote.reason === "occupancy" || quote.reason === "inactive") continue;
        unavailable = quote.reason;
        displayPaise = startingPrice(hotel.rooms, plans);
      }
    } else {
      displayPaise = startingPrice(hotel.rooms, plans);
      if (displayPaise === null) continue;
    }

    if (priceFiltered) {
      if (unavailable || displayPaise === null) continue;
      if (minPaise !== null && displayPaise < minPaise) continue;
      if (maxPaise !== null && displayPaise > maxPaise) continue;
    }

    results.push({ hotel, offer, unavailable, displayPaise, distanceM });
  }

  results.sort((a, b) => compare(a, b, search.sort));

  const pageSize = ctx.defaults.page_size;
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(search.page, pageCount);
  return {
    results: results.slice((page - 1) * pageSize, page * pageSize),
    total: results.length,
    page,
    pageCount,
    stay,
    landmark,
  };
}

/** Which nights to load from the calendar for a search (empty range when no dates). */
export function calendarWindow(stay: StayRequest | null): { from: IsoDate; to: IsoDate } | null {
  return stay ? { from: stay.checkIn, to: stay.checkOut } : null;
}
