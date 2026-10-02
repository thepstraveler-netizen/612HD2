import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { rideSettingsSchema, type RideMode, type RideSettings } from "@/schemas/rides";
import type { Tables } from "@/types/database";
import type { RideFareRule } from "./pricing";

/**
 * Public ride catalog: vehicle types, zones, landmarks and fare rules.
 * Small enough to load whole and cache under the `catalog` tag, which every
 * admin save clears.
 */

export type RideVehicleType = {
  id: string;
  key: string;
  serviceSlug: string;
  name: LocalizedJson;
  description: LocalizedJson | null;
  icon: string;
  seats: number;
  instantBook: boolean;
  taxBps: number;
};

export type RideZone = {
  id: string;
  slug: string;
  name: LocalizedJson;
  lat: number;
  lng: number;
  radiusKm: number;
};

export type RidePoint = {
  id: string;
  zoneId: string;
  slug: string;
  name: LocalizedJson;
  kind: Tables<"ride_points">["kind"];
  lat: number;
  lng: number;
  isPopular: boolean;
};

export type RideFare = RideFareRule & { zoneId: string; vehicleTypeId: string; mode: RideMode };

export type RideCatalog = {
  types: RideVehicleType[];
  zones: RideZone[];
  points: RidePoint[];
  fares: RideFare[];
};

const EMPTY: RideCatalog = { types: [], zones: [], points: [], fares: [] };

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[rides] ${scope}: ${error.message}`);
}

export function toRideFare(r: Tables<"ride_fare_rules">): RideFare {
  return {
    zoneId: r.zone_id,
    vehicleTypeId: r.vehicle_type_id,
    mode: r.mode,
    basePaise: r.base_paise,
    includedKm: Number(r.included_km),
    perKmPaise: r.per_km_paise,
    minFarePaise: r.min_fare_paise,
    hourlyRatePaise: r.hourly_rate_paise,
    minHours: r.min_hours,
    kmPerHour: r.km_per_hour,
    freeWaitingMinutes: r.free_waiting_minutes,
    perMinWaitingPaise: r.per_min_waiting_paise,
    nightBps: r.night_bps,
  };
}

export const getRideCatalog = unstable_cache(
  async (): Promise<RideCatalog> => {
    const supabase = createPublicClient();
    if (!supabase) return EMPTY;
    const [types, zones, points, fares] = await Promise.all([
      supabase.from("ride_vehicle_types").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("ride_zones").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("ride_points").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("ride_fare_rules").select("*").eq("is_active", true),
    ]);
    for (const [scope, res] of Object.entries({ types, zones, points, fares })) {
      if (res.error) fail(scope, res.error);
    }
    const zoneIds = new Set((zones.data ?? []).map((z) => z.id));
    return {
      types: (types.data ?? []).map((t) => ({
        id: t.id,
        key: t.key,
        serviceSlug: t.service_slug,
        name: t.name,
        description: t.description,
        icon: t.icon,
        seats: t.seats,
        instantBook: t.instant_book,
        taxBps: t.tax_bps,
      })),
      zones: (zones.data ?? []).map((z) => ({
        id: z.id,
        slug: z.slug,
        name: z.name,
        lat: z.lat,
        lng: z.lng,
        radiusKm: Number(z.radius_km),
      })),
      points: (points.data ?? [])
        .filter((p) => zoneIds.has(p.zone_id))
        .map((p) => ({
          id: p.id,
          zoneId: p.zone_id,
          slug: p.slug,
          name: p.name,
          kind: p.kind,
          lat: p.lat,
          lng: p.lng,
          isPopular: p.is_popular,
        })),
      fares: (fares.data ?? []).map(toRideFare),
    };
  },
  ["rides:catalog"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

/** `rides.defaults` is not public (its terms are shown, not the raw row). */
export const getRideSettings = unstable_cache(
  async (): Promise<RideSettings> => {
    if (!hasServiceRole()) return rideSettingsSchema.parse({});
    const { data } = await createAdminClient()
      .from("settings")
      .select("value")
      .eq("key", "rides.defaults")
      .maybeSingle();
    const parsed = rideSettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : rideSettingsSchema.parse({});
  },
  ["rides:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
