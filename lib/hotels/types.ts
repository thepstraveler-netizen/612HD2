import type { PricingRule, RatePlan, RoomType } from "@/lib/availability/engine";
import type { LocalizedJson } from "@/lib/i18n/localized";
import type { HotelPolicies, PropertyType } from "@/schemas/hotels";

/** A photo ready for the page: public URL plus localized alt text. */
export type HotelImage = { id: string; url: string; alt: LocalizedJson | null; roomId: string | null };

export type CatalogRoom = RoomType & {
  name: LocalizedJson;
  description: LocalizedJson | null;
  bedType: string | null;
  sizeSqft: number | null;
  amenityIds: string[];
  sortOrder: number;
};

export type CatalogPlan = RatePlan & {
  name: LocalizedJson;
  inclusions: LocalizedJson[];
  sortOrder: number;
};

/** One published hotel with everything the listing and detail page need. */
export type CatalogHotel = {
  id: string;
  slug: string;
  name: LocalizedJson;
  summary: LocalizedJson | null;
  description: LocalizedJson | null;
  propertyType: PropertyType;
  starRating: number;
  cityId: string;
  areaId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  checkInTime: string;
  checkOutTime: string;
  highlights: LocalizedJson[];
  foodDining: LocalizedJson | null;
  policies: HotelPolicies;
  isCoupleFriendly: boolean;
  isFeatured: boolean;
  isSponsored: boolean;
  payAtHotel: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  sortOrder: number;
  seo: { title?: string; description?: string };
  amenityIds: string[];
  images: HotelImage[];
  rooms: CatalogRoom[];
  plans: CatalogPlan[];
  rules: PricingRule[];
};

export type CatalogAmenity = { id: string; slug: string; name: LocalizedJson; icon: string | null; grouping: string };

export type CatalogCity = { id: string; slug: string; name: LocalizedJson; lat: number | null; lng: number | null };

export type CatalogArea = {
  id: string;
  cityId: string;
  slug: string;
  name: LocalizedJson;
  kind: string;
  lat: number | null;
  lng: number | null;
};

export type HotelCatalog = {
  hotels: CatalogHotel[];
  amenities: CatalogAmenity[];
  cities: CatalogCity[];
  areas: CatalogArea[];
};
