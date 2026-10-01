import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { cabSettingsSchema, type CabSettings, type CabTripType } from "@/schemas/cabs";
import type { Enums } from "@/types/database";
import type { FareRule, Surcharge } from "./pricing";

/**
 * Public cab catalog: places, categories with models, fares, routes, local
 * packages, add-ons and peak rules. Small enough to load whole and cache
 * under the `catalog` tag, which every admin save clears.
 */

export type CabPlace = {
  id: string;
  slug: string;
  name: LocalizedJson;
  kind: Enums<"cab_place_kind">;
  lat: number;
  lng: number;
  isPopular: boolean;
};

export type CabModel = { name: string; fuel: Enums<"fuel_type">; isFeatured: boolean };

export type CabCategory = {
  id: string;
  key: string;
  name: LocalizedJson;
  description: LocalizedJson | null;
  bodyType: Enums<"cab_body_type">;
  seats: number;
  luggage: number;
  isAc: boolean;
  image: string | null;
  models: CabModel[];
  /** Per-km rules by trip type (one_way, round_trip). */
  rules: Partial<Record<"one_way" | "round_trip", FareRule>>;
};

export type CabRoute = {
  id: string;
  slug: string;
  tripType: Exclude<CabTripType, "local">;
  fromId: string;
  toId: string;
  name: LocalizedJson | null;
  description: LocalizedJson | null;
  stops: string[];
  distanceKm: number;
  durationMinutes: number;
  isPopular: boolean;
  fares: Record<string, { farePaise: number; extraKmPaise: number; tollsIncluded: boolean }>;
};

export type CabPackage = {
  id: string;
  key: string;
  name: LocalizedJson;
  hours: number;
  km: number;
  fares: Record<string, { farePaise: number; extraKmPaise: number; extraHourPaise: number }>;
};

export type CabAddon = {
  id: string;
  key: string;
  name: LocalizedJson;
  description: LocalizedJson | null;
  pricePaise: number;
  tripTypes: CabTripType[];
  categoryIds: string[];
};

export type CabCatalog = {
  places: CabPlace[];
  categories: CabCategory[];
  routes: CabRoute[];
  packages: CabPackage[];
  addons: CabAddon[];
  surcharges: Surcharge[];
};

const EMPTY: CabCatalog = {
  places: [],
  categories: [],
  routes: [],
  packages: [],
  addons: [],
  surcharges: [],
};

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[cabs] ${scope}: ${error.message}`);
}

export const getCabCatalog = unstable_cache(
  async (): Promise<CabCatalog> => {
    const supabase = createPublicClient();
    if (!supabase) return EMPTY;
    const [places, categories, models, rules, routes, routeFares, packages, localFares, addons, surcharges] =
      await Promise.all([
        supabase.from("cab_places").select("*").eq("is_active", true).order("sort_order"),
        supabase
          .from("cab_categories")
          .select("*, image:media(path)")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("cab_models").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("cab_fare_rules").select("*").eq("is_active", true),
        supabase.from("cab_routes").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("cab_route_fares").select("*"),
        supabase.from("cab_local_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("cab_local_fares").select("*"),
        supabase.from("cab_addons").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("cab_surcharges").select("*").eq("is_active", true),
      ]);
    for (const [scope, res] of Object.entries({
      places,
      categories,
      models,
      rules,
      routes,
      routeFares,
      packages,
      localFares,
      addons,
      surcharges,
    })) {
      if (res.error) fail(scope, res.error);
    }

    return {
      places: (places.data ?? []).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        kind: p.kind,
        lat: p.lat,
        lng: p.lng,
        isPopular: p.is_popular,
      })),
      categories: (categories.data ?? []).map((c) => {
        const image = (c as { image?: { path: string } | null }).image;
        const own = (rules.data ?? []).filter((r) => r.category_id === c.id);
        const rule = (type: "one_way" | "round_trip"): FareRule | undefined => {
          const r = own.find((x) => x.trip_type === type);
          return r
            ? {
                ratePerKmPaise: r.rate_per_km_paise,
                minKm: r.min_km,
                minKmPerDay: r.min_km_per_day,
                driverAllowancePerDayPaise: r.driver_allowance_per_day_paise,
                nightChargePaise: r.night_charge_paise,
                extraKmPaise: r.extra_km_paise,
                tollsIncluded: r.tolls_included,
                waitingFreeMinutes: r.waiting_free_minutes,
                waitingPerHourPaise: r.waiting_per_hour_paise,
              }
            : undefined;
        };
        return {
          id: c.id,
          key: c.key,
          name: c.name,
          description: c.description,
          bodyType: c.body_type,
          seats: c.seats,
          luggage: c.luggage,
          isAc: c.is_ac,
          image: mediaUrl(image?.path),
          models: (models.data ?? [])
            .filter((m) => m.category_id === c.id)
            .map((m) => ({ name: m.name, fuel: m.fuel, isFeatured: m.is_featured })),
          rules: { one_way: rule("one_way"), round_trip: rule("round_trip") },
        };
      }),
      routes: (routes.data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        tripType: r.trip_type,
        fromId: r.from_place_id,
        toId: r.to_place_id,
        name: r.name,
        description: r.description,
        stops: Array.isArray(r.stops) ? r.stops.filter((s): s is string => typeof s === "string") : [],
        distanceKm: Number(r.distance_km),
        durationMinutes: r.duration_minutes,
        isPopular: r.is_popular,
        fares: Object.fromEntries(
          (routeFares.data ?? [])
            .filter((f) => f.route_id === r.id)
            .map((f) => [
              f.category_id,
              {
                farePaise: f.fare_paise,
                extraKmPaise: f.extra_km_paise ?? 0,
                tollsIncluded: f.tolls_included,
              },
            ]),
        ),
      })),
      packages: (packages.data ?? []).map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        hours: p.hours,
        km: p.km,
        fares: Object.fromEntries(
          (localFares.data ?? [])
            .filter((f) => f.package_id === p.id)
            .map((f) => [
              f.category_id,
              { farePaise: f.fare_paise, extraKmPaise: f.extra_km_paise, extraHourPaise: f.extra_hour_paise },
            ]),
        ),
      })),
      addons: (addons.data ?? []).map((a) => ({
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        pricePaise: a.price_paise,
        tripTypes: a.trip_types,
        categoryIds: a.category_ids,
      })),
      surcharges: (surcharges.data ?? []).map((s) => ({
        multiplierBps: s.multiplier_bps,
        startsOn: s.starts_on,
        endsOn: s.ends_on,
        weekdays: s.weekdays,
        tripTypes: s.trip_types,
        categoryIds: s.category_ids,
      })),
    };
  },
  ["cabs:catalog"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

/** `cabs.defaults` is not public (advance and refund terms are shown, not the raw row). */
export const getCabSettings = unstable_cache(
  async (): Promise<CabSettings> => {
    if (!hasServiceRole()) return cabSettingsSchema.parse({});
    const { data } = await createAdminClient()
      .from("settings")
      .select("value")
      .eq("key", "cabs.defaults")
      .maybeSingle();
    const parsed = cabSettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : cabSettingsSchema.parse({});
  },
  ["cabs:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
