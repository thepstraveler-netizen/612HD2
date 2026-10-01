import "server-only";
import { indexCalendar, type CalendarIndex, type PricingRule } from "@/lib/availability/engine";
import type { IsoDate } from "@/lib/dates";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { paiseToRupeesInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import {
  hotelPoliciesSchema,
  type HotelFormInput,
  type PricingRuleFormInput,
  type RoomFormInput,
} from "@/schemas/hotels";
import { pricingRuleAmountInput } from "./admin-rows";
import type { HotelExportRow } from "./csv";
import type { CatalogPlan, CatalogRoom } from "./types";

/**
 * Admin reads for the hotel module. They run as the signed-in user (RLS:
 * hotels.read), uncached, and see drafts and archived hotels too. Queries
 * stay flat; joins happen here in memory.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[hotels admin] ${scope}: ${error.message}`);
}

const emptyLocalized = { en: "", hi: "" };

function localizedInput(value: LocalizedJson | null | undefined) {
  return value ? { en: value.en, hi: value.hi ?? "" } : emptyLocalized;
}

// ---------------------------------------------------------------- hotels

export type AdminHotelRow = {
  id: string;
  name: LocalizedJson;
  slug: string;
  city: LocalizedJson | null;
  property_type: string;
  star_rating: number;
  status: string;
  is_featured: boolean;
  is_sponsored: boolean;
  sort_order: number;
};

export async function listAdminHotels(): Promise<AdminHotelRow[]> {
  const supabase = await createClient();
  const [hotels, cities] = await Promise.all([
    supabase
      .from("hotels")
      .select(
        "id, name, slug, city_id, property_type, star_rating, status, is_featured, is_sponsored, sort_order",
      )
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    supabase.from("cities").select("id, name"),
  ]);
  if (hotels.error) fail("hotels", hotels.error);
  if (cities.error) fail("cities", cities.error);
  const cityName = new Map(cities.data.map((c) => [c.id, c.name]));
  return hotels.data.map(({ city_id, ...h }) => ({ ...h, city: cityName.get(city_id) ?? null }));
}

/** Name and slug for page headers; null when missing or deleted. */
export async function getAdminHotel(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotels")
    .select("id, slug, name, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("hotel", error);
  return data;
}

export type Option = { value: string; label: LocalizedJson };

export type HotelFormOptions = {
  cities: Option[];
  areas: (Option & { cityId: string })[];
  amenities: (Option & { grouping: string })[];
  vendors: { value: string; label: string }[];
};

export async function getHotelFormOptions(): Promise<HotelFormOptions> {
  const supabase = await createClient();
  const [cities, areas, amenities, vendors] = await Promise.all([
    supabase.from("cities").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("areas").select("id, city_id, name").eq("is_active", true).order("sort_order"),
    supabase.from("amenities").select("id, name, grouping").eq("is_active", true).order("sort_order"),
    supabase.from("vendors").select("id, name").eq("kind", "hotel").is("deleted_at", null).order("name"),
  ]);
  if (cities.error) fail("cities", cities.error);
  if (areas.error) fail("areas", areas.error);
  if (amenities.error) fail("amenities", amenities.error);
  // Vendors are optional here: a hotel editor without vendors.read still edits hotels.
  return {
    cities: cities.data.map((c) => ({ value: c.id, label: c.name })),
    areas: areas.data.map((a) => ({ value: a.id, label: a.name, cityId: a.city_id })),
    amenities: amenities.data.map((a) => ({ value: a.id, label: a.name, grouping: a.grouping })),
    vendors: (vendors.data ?? []).map((v) => ({ value: v.id, label: v.name })),
  };
}

export function newHotelDefaults(cityId: string): HotelFormInput {
  return {
    slug: "",
    name: emptyLocalized,
    summary: emptyLocalized,
    description: emptyLocalized,
    property_type: "hotel",
    star_rating: 0,
    city_id: cityId,
    area_id: "",
    vendor_id: "",
    address: "",
    lat: "",
    lng: "",
    check_in_time: "12:00",
    check_out_time: "11:00",
    highlights: [],
    food_dining: emptyLocalized,
    policies: hotelPoliciesSchema.parse({}),
    amenity_ids: [],
    is_couple_friendly: false,
    is_featured: false,
    is_sponsored: false,
    pay_at_hotel_enabled: false,
    part_payment_percent: "",
    early_checkin: "",
    late_checkout: "",
    breakfast_addon: "",
    commission_percent: "",
    rating_avg: "",
    rating_count: 0,
    status: "draft",
    seo_title: "",
    seo_description: "",
    sort_order: 100,
  };
}

export async function getHotelFormValues(id: string): Promise<HotelFormInput | null> {
  const supabase = await createClient();
  const [hotel, amenities] = await Promise.all([
    supabase.from("hotels").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("hotel_amenities").select("amenity_id").eq("hotel_id", id),
  ]);
  if (hotel.error) fail("hotel", hotel.error);
  if (amenities.error) fail("hotel amenities", amenities.error);
  const h = hotel.data;
  if (!h) return null;
  const policies = hotelPoliciesSchema.safeParse(h.policies ?? {});
  const seo = (h.seo ?? {}) as { title?: unknown; description?: unknown };
  return {
    id: h.id,
    slug: h.slug,
    name: localizedInput(h.name),
    summary: localizedInput(h.summary),
    description: localizedInput(h.description),
    property_type: h.property_type,
    star_rating: h.star_rating,
    city_id: h.city_id,
    area_id: h.area_id ?? "",
    vendor_id: h.vendor_id ?? "",
    address: h.address ?? "",
    lat: h.lat === null ? "" : String(h.lat),
    lng: h.lng === null ? "" : String(h.lng),
    check_in_time: h.check_in_time.slice(0, 5),
    check_out_time: h.check_out_time.slice(0, 5),
    highlights: h.highlights.map(localizedInput),
    food_dining: localizedInput(h.food_dining),
    policies: policies.success
      ? { ...policies.data, rules: policies.data.rules.map(localizedInput) }
      : hotelPoliciesSchema.parse({}),
    amenity_ids: amenities.data.map((a) => a.amenity_id),
    is_couple_friendly: h.is_couple_friendly,
    is_featured: h.is_featured,
    is_sponsored: h.is_sponsored,
    pay_at_hotel_enabled: h.pay_at_hotel_enabled,
    part_payment_percent: h.part_payment_percent === null ? "" : String(h.part_payment_percent),
    early_checkin: paiseToRupeesInput(h.early_checkin_paise),
    late_checkout: paiseToRupeesInput(h.late_checkout_paise),
    breakfast_addon: paiseToRupeesInput(h.breakfast_addon_paise),
    commission_percent: h.commission_bps === null ? "" : String(h.commission_bps / 100),
    rating_avg: h.rating_avg === null ? "" : String(Number(h.rating_avg)),
    rating_count: h.rating_count,
    status: h.status,
    seo_title: typeof seo.title === "string" ? seo.title : "",
    seo_description: typeof seo.description === "string" ? seo.description : "",
    sort_order: h.sort_order,
  };
}

export type GalleryImage = { mediaId: string; url: string };

export async function getHotelGallery(hotelId: string): Promise<GalleryImage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotel_media")
    .select("media_id, sort_order, media:media_id (path)")
    .eq("hotel_id", hotelId)
    .order("sort_order");
  if (error) fail("media", error);
  return data.flatMap((m) => {
    const url = mediaUrl((m.media as { path: string } | null)?.path);
    return url ? [{ mediaId: m.media_id, url }] : [];
  });
}

// ---------------------------------------------------------------- rooms

export type AdminRoom = CatalogRoom & { plans: CatalogPlan[] };

/** Rooms of a hotel with their plans, in the engine's shapes (calendar, scopes, lists). */
export async function getHotelRooms(hotelId: string): Promise<AdminRoom[]> {
  const supabase = await createClient();
  const { data: rooms, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("sort_order")
    .order("created_at");
  if (error) fail("rooms", error);
  const roomIds = rooms.map((r) => r.id);
  const plansRes = roomIds.length
    ? await supabase.from("hotel_rate_plans").select("*").in("room_id", roomIds).order("sort_order")
    : null;
  if (plansRes?.error) fail("plans", plansRes.error);
  const plans = plansRes?.data ?? [];
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
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
    plans: plans
      .filter((p) => p.room_id === r.id)
      .map((p) => ({
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
      })),
  }));
}

export function newRoomDefaults(hotelId: string): RoomFormInput {
  return {
    hotel_id: hotelId,
    name: emptyLocalized,
    description: emptyLocalized,
    bed_type: "",
    size_sqft: "",
    base_occupancy: 2,
    max_adults: 2,
    max_children: 1,
    max_occupancy: 3,
    total_units: 1,
    amenity_ids: [],
    sort_order: 100,
    is_active: true,
    plans: [newPlanDefaults()],
  };
}

export function newPlanDefaults(): RoomFormInput["plans"][number] {
  return {
    name: { en: "Room only", hi: "केवल कमरा" },
    meal_plan: "room_only",
    inclusions: [],
    is_refundable: true,
    free_cancel_hours: "24",
    base_price: "",
    extra_adult: "",
    extra_child: "",
    min_stay: 1,
    max_stay: "",
    is_active: true,
  };
}

export async function getRoomFormValues(hotelId: string, roomId: string): Promise<RoomFormInput | null> {
  const supabase = await createClient();
  const [room, plans] = await Promise.all([
    supabase.from("hotel_rooms").select("*").eq("id", roomId).eq("hotel_id", hotelId).maybeSingle(),
    supabase.from("hotel_rate_plans").select("*").eq("room_id", roomId).order("sort_order"),
  ]);
  if (room.error) fail("room", room.error);
  if (plans.error) fail("plans", plans.error);
  const r = room.data;
  if (!r) return null;
  return {
    id: r.id,
    hotel_id: r.hotel_id,
    name: localizedInput(r.name),
    description: localizedInput(r.description),
    bed_type: r.bed_type ?? "",
    size_sqft: r.size_sqft === null ? "" : String(r.size_sqft),
    base_occupancy: r.base_occupancy,
    max_adults: r.max_adults,
    max_children: r.max_children,
    max_occupancy: r.max_occupancy,
    total_units: r.total_units,
    amenity_ids: r.amenity_ids,
    sort_order: r.sort_order,
    is_active: r.is_active,
    plans: plans.data.map((p) => {
      const free = p.cancellation_rules.find((rule) => rule.refund_percent >= 100);
      return {
        id: p.id,
        name: localizedInput(p.name),
        meal_plan: p.meal_plan,
        inclusions: p.inclusions.map(localizedInput),
        is_refundable: p.is_refundable,
        free_cancel_hours: free ? String(free.hours_before) : "",
        base_price: paiseToRupeesInput(p.base_price_paise),
        extra_adult: paiseToRupeesInput(p.extra_adult_paise),
        extra_child: paiseToRupeesInput(p.extra_child_paise),
        min_stay: p.min_stay,
        max_stay: p.max_stay === null ? "" : String(p.max_stay),
        is_active: p.is_active,
      };
    }),
  };
}

// ---------------------------------------------------------------- calendar

export async function getPricingRules(hotelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotel_pricing_rules")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("priority", { ascending: false })
    .order("start_date");
  if (error) fail("pricing rules", error);
  return data;
}

/** Inventory, overrides and active rules for one room over [from, to]. */
export async function getRoomCalendar(
  hotelId: string,
  room: AdminRoom,
  from: IsoDate,
  to: IsoDate,
): Promise<CalendarIndex> {
  const supabase = await createClient();
  const planIds = room.plans.map((p) => p.id);
  const [inventory, rates, rules] = await Promise.all([
    supabase
      .from("hotel_inventory")
      .select("room_id, date, units, sold_units, held_units, is_closed, min_stay")
      .eq("room_id", room.id)
      .gte("date", from)
      .lte("date", to),
    planIds.length
      ? supabase
          .from("hotel_rates")
          .select("rate_plan_id, date, price_paise")
          .in("rate_plan_id", planIds)
          .gte("date", from)
          .lte("date", to)
      : null,
    getPricingRules(hotelId),
  ]);
  if (inventory.error) fail("inventory", inventory.error);
  if (rates?.error) fail("rates", rates.error);
  return indexCalendar(
    inventory.data.map((d) => ({
      roomId: d.room_id,
      date: d.date,
      units: d.units,
      soldUnits: d.sold_units,
      heldUnits: d.held_units,
      isClosed: d.is_closed,
      minStay: d.min_stay,
    })),
    (rates?.data ?? []).map((r) => ({ ratePlanId: r.rate_plan_id, date: r.date, pricePaise: r.price_paise })),
    rules.map((r): PricingRule => ({
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
  );
}

// ---------------------------------------------------------------- pricing rules

export function newPricingRuleDefaults(hotelId: string, today: IsoDate): PricingRuleFormInput {
  return {
    hotel_id: hotelId,
    room_id: "",
    rate_plan_id: "",
    name: "",
    start_date: today,
    end_date: today,
    weekdays: [],
    adjustment: "percent",
    amount: "",
    priority: 10,
    is_active: true,
  };
}

export async function getPricingRuleFormValues(
  hotelId: string,
  ruleId: string,
): Promise<PricingRuleFormInput | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotel_pricing_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (error) fail("pricing rule", error);
  if (!data) return null;
  return {
    id: data.id,
    hotel_id: data.hotel_id,
    room_id: data.room_id ?? "",
    rate_plan_id: data.rate_plan_id ?? "",
    name: data.name,
    start_date: data.start_date,
    end_date: data.end_date,
    weekdays: data.weekdays,
    adjustment: data.adjustment,
    amount: pricingRuleAmountInput(data.value),
    priority: data.priority,
    is_active: data.is_active,
  };
}

// ---------------------------------------------------------------- export

/** One row per rate plan across all non-deleted hotels. */
export async function getHotelExportRows(): Promise<HotelExportRow[]> {
  const supabase = await createClient();
  const [hotels, cities] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, slug, name, status, city_id, property_type, star_rating")
      .is("deleted_at", null)
      .order("sort_order")
      .order("slug"),
    supabase.from("cities").select("id, slug"),
  ]);
  if (hotels.error) fail("hotels", hotels.error);
  if (cities.error) fail("cities", cities.error);
  const hotelIds = hotels.data.map((h) => h.id);
  const roomsRes = hotelIds.length
    ? await supabase
        .from("hotel_rooms")
        .select("id, hotel_id, name, total_units, sort_order")
        .in("hotel_id", hotelIds)
        .order("sort_order")
    : null;
  if (roomsRes?.error) fail("rooms", roomsRes.error);
  const rooms = roomsRes?.data ?? [];
  const roomIds = rooms.map((r) => r.id);
  const plansRes = roomIds.length
    ? await supabase
        .from("hotel_rate_plans")
        .select(
          "room_id, name, meal_plan, base_price_paise, extra_adult_paise, extra_child_paise, is_refundable",
        )
        .in("room_id", roomIds)
        .order("sort_order")
    : null;
  if (plansRes?.error) fail("plans", plansRes.error);
  const plans = plansRes?.data ?? [];
  const citySlug = new Map(cities.data.map((c) => [c.id, c.slug]));

  return hotels.data.flatMap((h) => {
    const base = {
      hotelSlug: h.slug,
      hotelName: pickLocalized(h.name, "en"),
      status: h.status,
      citySlug: citySlug.get(h.city_id) ?? "",
      propertyType: h.property_type,
      stars: h.star_rating,
    };
    return rooms
      .filter((r) => r.hotel_id === h.id)
      .flatMap((r) =>
        plans
          .filter((p) => p.room_id === r.id)
          .map((p): HotelExportRow => ({
            ...base,
            roomName: pickLocalized(r.name, "en"),
            units: r.total_units,
            planName: pickLocalized(p.name, "en"),
            mealPlan: p.meal_plan,
            basePricePaise: p.base_price_paise,
            extraAdultPaise: p.extra_adult_paise,
            extraChildPaise: p.extra_child_paise,
            refundable: p.is_refundable,
          })),
      );
  });
}
