import type { LocalizedJson } from "@/lib/i18n/localized";
import type { Meal, PackageBookingMode } from "@/schemas/packages";

/** Catalog shapes shared by the package pages, the booking price and the server checkout. */

export type PricingTier = {
  id: string;
  minPax: number;
  maxPax: number;
  adultPricePaise: number;
  /** Null = children pay the adult price. */
  childPricePaise: number | null;
};

export type Departure = {
  id: string;
  startDate: string;
  /** Null = no seat limit. */
  seatsTotal: number | null;
  /** Null = no seat limit. */
  seatsLeft: number | null;
  supplementPaise: number;
  note: LocalizedJson | null;
};

export type ItineraryDay = {
  id: string;
  day: number;
  title: LocalizedJson;
  description: LocalizedJson | null;
  meals: Meal[];
  overnight: string | null;
};

export type PackageSummary = {
  id: string;
  slug: string;
  title: LocalizedJson;
  summary: LocalizedJson;
  category: string;
  destinations: string[];
  startCity: string | null;
  days: number;
  nights: number;
  imageUrl: string | null;
  bookingMode: PackageBookingMode;
  fixedDepartures: boolean;
  /** Lowest adult price per person across tiers (before GST), for "from ₹…". */
  fromPaise: number | null;
  rating: number | null;
  isFeatured: boolean;
  /** Next bookable departure date, for fixed departures. */
  nextDeparture: string | null;
};

export type PackageDetail = PackageSummary & {
  description: LocalizedJson | null;
  gallery: string[];
  highlights: LocalizedJson[];
  inclusions: LocalizedJson[];
  exclusions: LocalizedJson[];
  terms: LocalizedJson | null;
  minPax: number;
  maxPax: number;
  advancePercent: number | null;
  taxBps: number;
  sac: string;
  tiers: PricingTier[];
  departures: Departure[];
  itinerary: ItineraryDay[];
};
