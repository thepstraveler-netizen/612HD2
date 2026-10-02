import { distanceMeters } from "@/lib/geo";
import { finalizePrice } from "@/lib/pricing/booking";
import { fromIndiaLocal } from "@/lib/cabs/time";
import type { RideMode, RideSearch, RideSettings } from "@/schemas/rides";
import { estimateRide, findZone, quoteRide, type LatLng, type RideQuote, type RideTerms } from "./pricing";
import type { RideCatalog, RideFare, RidePoint, RideVehicleType, RideZone } from "./queries";

/**
 * Turns a ride search (from the URL) into a priced ride per vehicle type.
 * Pure, over the catalog and settings, so the ride page, review page and
 * booking action agree.
 */

export type RidePlace = LatLng & {
  /** The landmark, when one was picked; null for "my location". */
  point: RidePoint | null;
};

export type RidePlan = {
  mode: RideMode;
  zone: RideZone;
  pickup: RidePlace;
  drop: RidePlace | null;
  hours: number | null;
  pickupAt: Date;
  /** "Ride now": pickup is the lead time from now. */
  isNow: boolean;
  passengers: number;
  distanceKm: number | null;
  durationMinutes: number | null;
};

export type RidePlanError =
  | "incomplete"
  | "unknown_point"
  | "out_of_area"
  | "same_place"
  | "too_long"
  | "too_soon"
  | "too_far"
  | "too_many_hours";

export type RidePlanResult = { ok: true; plan: RidePlan } | { ok: false; error: RidePlanError };

type PlaceResult = { ok: true; place: RidePlace | null } | { ok: false; error: RidePlanError };

function place(catalog: RideCatalog, slug: string | undefined, lat?: number, lng?: number): PlaceResult {
  if (!slug) return { ok: true, place: null };
  if (slug === "here") {
    if (lat === undefined || lng === undefined) return { ok: true, place: null };
    return { ok: true, place: { lat, lng, point: null } };
  }
  const point = catalog.points.find((p) => p.slug === slug);
  return point
    ? { ok: true, place: { lat: point.lat, lng: point.lng, point } }
    : { ok: false, error: "unknown_point" };
}

/** "Ride now" picks up after the lead time, rounded up to the next 5 minutes. */
export function nowPickup(now: Date, leadMinutes: number): Date {
  const t = now.getTime() + leadMinutes * 60_000;
  const step = 5 * 60_000;
  return new Date(Math.ceil(t / step) * step);
}

export function planRide(
  search: RideSearch,
  catalog: RideCatalog,
  settings: RideSettings,
  now: Date,
): RidePlanResult {
  const from = place(catalog, search.from, search.flat, search.flng);
  if (!from.ok) return from;
  if (!from.place) return { ok: false, error: "incomplete" };
  const pickup = from.place;

  let drop: RidePlace | null = null;
  if (search.mode === "point_to_point") {
    const to = place(catalog, search.to, search.tlat, search.tlng);
    if (!to.ok) return to;
    if (!to.place) return { ok: false, error: "incomplete" };
    drop = to.place;
  }

  const zone = pickup.point
    ? (catalog.zones.find((z) => z.id === pickup.point?.zoneId) ?? null)
    : findZone(catalog.zones, pickup);
  if (!zone) return { ok: false, error: "out_of_area" };

  let pickupAt: Date;
  const isNow = search.at === "now";
  if (isNow) pickupAt = nowPickup(now, settings.min_lead_minutes);
  else {
    const at = fromIndiaLocal(search.at);
    if (!at) return { ok: false, error: "incomplete" };
    if (at.getTime() < now.getTime() + settings.min_lead_minutes * 60_000)
      return { ok: false, error: "too_soon" };
    if (at.getTime() > now.getTime() + settings.max_advance_days * 86_400_000)
      return { ok: false, error: "too_far" };
    pickupAt = at;
  }

  let distanceKm: number | null = null;
  let durationMinutes: number | null = null;
  let hours: number | null = null;
  if (drop) {
    if (distanceMeters(pickup, drop) < 150) return { ok: false, error: "same_place" };
    const estimate = estimateRide(pickup, drop, {
      roadFactor: settings.road_factor,
      avgSpeedKmph: settings.avg_speed_kmph,
    });
    if (estimate.distanceKm > settings.max_ride_km) return { ok: false, error: "too_long" };
    distanceKm = estimate.distanceKm;
    durationMinutes = estimate.durationMinutes;
  } else {
    if (search.hrs > settings.max_hours) return { ok: false, error: "too_many_hours" };
    hours = search.hrs;
    durationMinutes = hours * 60;
  }

  return {
    ok: true,
    plan: {
      mode: search.mode,
      zone,
      pickup,
      drop,
      hours,
      pickupAt,
      isNow,
      passengers: search.pax,
      distanceKm,
      durationMinutes,
    },
  };
}

export function fareFor(plan: RidePlan, type: RideVehicleType, catalog: RideCatalog): RideFare | null {
  return (
    catalog.fares.find(
      (f) => f.zoneId === plan.zone.id && f.vehicleTypeId === type.id && f.mode === plan.mode,
    ) ?? null
  );
}

/** English ride text for invoices and the booking snapshot. */
export function rideLabel(plan: RidePlan, type: RideVehicleType): string {
  const name = (p: RidePlace) => p.point?.name.en ?? "Current location";
  if (plan.mode === "hourly") return `${type.name.en} · ${plan.hours} hr · from ${name(plan.pickup)}`;
  return `${type.name.en} · ${name(plan.pickup)} → ${plan.drop ? name(plan.drop) : ""}`;
}

export type FeeTerms = { convenienceFeePaise: number; feeTaxBps: number; feeSac: string };

export function quoteVehicle(
  plan: RidePlan,
  type: RideVehicleType,
  catalog: RideCatalog,
  settings: RideSettings,
  fee: FeeTerms | null,
): RideQuote | null {
  const rule = fareFor(plan, type, catalog);
  if (!rule) return null;
  return quoteRide({
    mode: plan.mode,
    rule,
    distanceKm: plan.distanceKm,
    hours: plan.hours,
    pickupAt: plan.pickupAt,
    night: { start: settings.night_start, end: settings.night_end },
    label: rideLabel(plan, type),
    taxBps: type.taxBps,
    sac: settings.sac,
    convenienceFeePaise: fee?.convenienceFeePaise ?? 0,
    feeTaxBps: fee?.feeTaxBps ?? 0,
    feeSac: fee?.feeSac ?? settings.sac,
  });
}

export type RideOffer = {
  type: RideVehicleType;
  /** Fare incl. GST, before coupons and the convenience fee. */
  totalPaise: number;
  terms: RideTerms;
  fits: boolean;
};

/** One priced offer per vehicle type serving this zone and mode, in catalog order. */
export function rideOffers(plan: RidePlan, catalog: RideCatalog, settings: RideSettings): RideOffer[] {
  return catalog.types
    .map((type) => {
      const quote = quoteVehicle(plan, type, catalog, settings, null);
      if (!quote) return null;
      return {
        type,
        terms: quote.terms,
        totalPaise: finalizePrice(quote.drafts, 0, []).totalPaise,
        fits: type.seats >= plan.passengers,
      };
    })
    .filter((o): o is RideOffer => o !== null);
}
