import "server-only";
import { unstable_cache } from "next/cache";
import type { CalendarIndex, InventoryDay, RateOverride } from "@/lib/availability/engine";
import { indexCalendar } from "@/lib/availability/engine";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import type { IsoDate } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";
import { DEFAULT_GST_SLABS, gstSlabsSchema, type GstSlab } from "@/lib/pricing/tax";
import { createPublicClient } from "@/lib/supabase/public";
import type { LocalizedJson } from "@/lib/i18n/localized";
import {
  hotelPoliciesSchema,
  hotelSearchDefaultsSchema,
  type HotelSearchDefaults,
} from "@/schemas/hotels";
import type { CatalogHotel, CatalogPlan, CatalogRoom, HotelCatalog, HotelImage } from "./types";

/**
 * Public hotel reads. The catalog (hotels, rooms, plans, rules, photos) is
 * cached under the `catalog` tag like the rest of the site; per-date
 * inventory and rates are cached briefly under `hotel-calendar` because
 * bookings (phase 4) change them often.
 */
export const HOTEL_CALENDAR_TAG = "hotel-calendar";

const EMPTY: HotelCatalog = { hotels: [], amenities: [], cities: [], areas: [] };

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[hotels] ${scope}: ${error.message}`);
}

export const getHotelCatalog = unstable_cache(
  async (): Promise<HotelCatalog> => {
    const supabase = createPublicClient();
    if (!supabase) return EMPTY;

    const [hotelsRes, amenitiesRes, citiesRes, areasRes] = await Promise.all([
      supabase
        .from("hotels")
        .select("*")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("sort_order"),
      supabase.from("amenities").select("id, slug, name, icon, grouping").eq("is_active", true).order("sort_order"),
      supabase.from("cities").select("id, slug, name, lat, lng").eq("is_active", true).order("sort_order"),
      supabase
        .from("areas")
        .select("id, city_id, slug, name, kind, lat, lng")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (hotelsRes.error) fail("hotels", hotelsRes.error);
    if (amenitiesRes.error) fail("amenities", amenitiesRes.error);
    if (citiesRes.error) fail("cities", citiesRes.error);
    if (areasRes.error) fail("areas", areasRes.error);

    const hotelIds = hotelsRes.data.map((h) => h.id);
    const children = hotelIds.length
      ? await Promise.all([
          supabase.from("hotel_rooms").select("*").in("hotel_id", hotelIds).order("sort_order"),
          supabase.from("hotel_pricing_rules").select("*").in("hotel_id", hotelIds).eq("is_active", true),
          supabase
            .from("hotel_media")
            .select("hotel_id, room_id, sort_order, media:media_id (id, path, alt)")
            .in("hotel_id", hotelIds)
            .order("sort_order"),
          supabase.from("hotel_amenities").select("hotel_id, amenity_id").in("hotel_id", hotelIds),
        ])
      : null;
    if (children?.[0].error) fail("rooms", children[0].error);
    if (children?.[1].error) fail("rules", children[1].error);
    if (children?.[2].error) fail("media", children[2].error);
    if (children?.[3].error) fail("hotel amenities", children[3].error);
    const rooms = children?.[0].data ?? [];
    const rules = children?.[1].data ?? [];
    const media = children?.[2].data ?? [];
    const hotelAmenities = children?.[3].data ?? [];

    const roomIds = rooms.map((r) => r.id);
    const plansRes = roomIds.length
      ? await supabase.from("hotel_rate_plans").select("*").in("room_id", roomIds).order("sort_order")
      : null;
    if (plansRes?.error) fail("plans", plansRes.error);
    const plans = plansRes?.data ?? [];

    const roomsByHotel = new Map<string, CatalogRoom[]>();
    const hotelOfRoom = new Map<string, string>();
    for (const r of rooms) {
      hotelOfRoom.set(r.id, r.hotel_id);
      const list = roomsByHotel.get(r.hotel_id) ?? [];
      list.push({
        id: r.id,
        name: r.name,
        description: r.description?.en ? r.description : null,
        bedType: r.bed_type,
        sizeSqft: r.size_sqft,
        baseOccupancy: r.base_occupancy,
        maxAdults: r.max_adults,
        maxChildren: r.max_children,
        maxOccupancy: r.max_occupancy,
        totalUnits: r.total_units,
        amenityIds: r.amenity_ids,
        sortOrder: r.sort_order,
        isActive: r.is_active,
      });
      roomsByHotel.set(r.hotel_id, list);
    }

    const plansByHotel = new Map<string, CatalogPlan[]>();
    for (const p of plans) {
      const hotelId = hotelOfRoom.get(p.room_id);
      if (!hotelId) continue;
      const list = plansByHotel.get(hotelId) ?? [];
      list.push({
        id: p.id,
        roomId: p.room_id,
        name: p.name,
        mealPlan: p.meal_plan,
        inclusions: p.inclusions,
        isRefundable: p.is_refundable,
        cancellationRules: p.cancellation_rules,
        basePricePaise: p.base_price_paise,
        extraAdultPaise: p.extra_adult_paise,
        extraChildPaise: p.extra_child_paise,
        minStay: p.min_stay,
        maxStay: p.max_stay,
        sortOrder: p.sort_order,
        isActive: p.is_active,
      });
      plansByHotel.set(hotelId, list);
    }

    const imagesByHotel = new Map<string, HotelImage[]>();
    for (const m of media) {
      const file = m.media as { id: string; path: string; alt: LocalizedJson | null } | null;
      const url = mediaUrl(file?.path);
      if (!file || !url) continue;
      const list = imagesByHotel.get(m.hotel_id) ?? [];
      list.push({ id: file.id, url, alt: file.alt, roomId: m.room_id });
      imagesByHotel.set(m.hotel_id, list);
    }

    const hotels: CatalogHotel[] = hotelsRes.data.map((h) => {
      const seo = (h.seo ?? {}) as { title?: string; description?: string };
      return {
        id: h.id,
        slug: h.slug,
        name: h.name,
        summary: h.summary,
        description: h.description?.en ? h.description : null,
        propertyType: h.property_type,
        starRating: h.star_rating,
        cityId: h.city_id,
        areaId: h.area_id,
        address: h.address,
        lat: h.lat,
        lng: h.lng,
        checkInTime: h.check_in_time.slice(0, 5),
        checkOutTime: h.check_out_time.slice(0, 5),
        highlights: h.highlights,
        foodDining: h.food_dining?.en ? h.food_dining : null,
        policies: hotelPoliciesSchema.parse(h.policies ?? {}),
        isCoupleFriendly: h.is_couple_friendly,
        isFeatured: h.is_featured,
        isSponsored: h.is_sponsored,
        payAtHotel: h.pay_at_hotel_enabled,
        ratingAvg: h.rating_avg === null ? null : Number(h.rating_avg),
        ratingCount: h.rating_count,
        sortOrder: h.sort_order,
        seo: { title: seo.title || undefined, description: seo.description || undefined },
        amenityIds: hotelAmenities.filter((a) => a.hotel_id === h.id).map((a) => a.amenity_id),
        images: imagesByHotel.get(h.id) ?? [],
        rooms: roomsByHotel.get(h.id) ?? [],
        plans: plansByHotel.get(h.id) ?? [],
        rules: rules
          .filter((r) => r.hotel_id === h.id)
          .map((r) => ({
            id: r.id,
            roomId: r.room_id,
            ratePlanId: r.rate_plan_id,
            startDate: r.start_date,
            endDate: r.end_date,
            weekdays: r.weekdays,
            adjustment: r.adjustment,
            value: r.value,
            priority: r.priority,
            isActive: r.is_active,
          })),
      };
    });

    return {
      hotels,
      amenities: amenitiesRes.data,
      cities: citiesRes.data,
      areas: areasRes.data.map((a) => ({
        id: a.id,
        cityId: a.city_id,
        slug: a.slug,
        name: a.name,
        kind: a.kind,
        lat: a.lat,
        lng: a.lng,
      })),
    };
  },
  ["hotels:catalog"],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export async function getHotelBySlug(slug: string): Promise<CatalogHotel | undefined> {
  return (await getHotelCatalog()).hotels.find((h) => h.slug === slug);
}

const getCalendarRows = unstable_cache(
  async (
    roomIds: string[],
    planIds: string[],
    from: IsoDate,
    to: IsoDate,
  ): Promise<{ inventory: InventoryDay[]; rates: RateOverride[] }> => {
    const supabase = createPublicClient();
    if (!supabase || (roomIds.length === 0 && planIds.length === 0)) return { inventory: [], rates: [] };
    const [inv, rates] = await Promise.all([
      roomIds.length
        ? supabase
            .from("hotel_inventory")
            .select("room_id, date, units, sold_units, is_closed, min_stay")
            .in("room_id", roomIds)
            .gte("date", from)
            .lte("date", to)
        : null,
      planIds.length
        ? supabase
            .from("hotel_rates")
            .select("rate_plan_id, date, price_paise")
            .in("rate_plan_id", planIds)
            .gte("date", from)
            .lte("date", to)
        : null,
    ]);
    if (inv?.error) fail("inventory", inv.error);
    if (rates?.error) fail("rates", rates.error);
    return {
      inventory: (inv?.data ?? []).map((d) => ({
        roomId: d.room_id,
        date: d.date,
        units: d.units,
        soldUnits: d.sold_units,
        isClosed: d.is_closed,
        minStay: d.min_stay,
      })),
      rates: (rates?.data ?? []).map((r) => ({ ratePlanId: r.rate_plan_id, date: r.date, pricePaise: r.price_paise })),
    };
  },
  ["hotels:calendar"],
  { tags: [HOTEL_CALENDAR_TAG, CATALOG_TAG], revalidate: 60 },
);

/** Per-date inventory and rate overrides for these hotels over [from, to]. */
export async function getHotelCalendar(
  hotels: CatalogHotel[],
  from: IsoDate,
  to: IsoDate,
): Promise<CalendarIndex> {
  const roomIds = hotels.flatMap((h) => h.rooms.map((r) => r.id)).sort();
  const planIds = hotels.flatMap((h) => h.plans.map((p) => p.id)).sort();
  const { inventory, rates } = await getCalendarRows(roomIds, planIds, from, to);
  return indexCalendar(
    inventory,
    rates,
    hotels.flatMap((h) => h.rules),
  );
}

async function readSetting(key: string): Promise<unknown> {
  const supabase = createPublicClient();
  if (!supabase) return undefined;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value;
}

export const getGstSlabs = unstable_cache(
  async (): Promise<GstSlab[]> => {
    const parsed = gstSlabsSchema.safeParse(await readSetting("tax.hotel_gst_slabs"));
    return parsed.success ? parsed.data : DEFAULT_GST_SLABS;
  },
  ["hotels:gst"],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export const getHotelSearchDefaults = unstable_cache(
  async (): Promise<HotelSearchDefaults> => {
    const parsed = hotelSearchDefaultsSchema.safeParse((await readSetting("hotels.search_defaults")) ?? {});
    return parsed.success ? parsed.data : hotelSearchDefaultsSchema.parse({});
  },
  ["hotels:search-defaults"],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);
