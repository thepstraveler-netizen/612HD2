import { distanceMeters } from "@/lib/geo";
import type { DraftLine } from "@/lib/pricing/booking";
import { indiaDate, isNightTime } from "@/lib/cabs/time";
import type { RideMode } from "@/schemas/rides";

/**
 * Local ride fares. Pure: the ride page, the review page and the booking
 * action all run this on the zone's fare rule and settings read on the
 * server, so what the customer sees is what they are charged.
 *
 *   Point to point: max(min_fare, base + max(0, km − included_km) × per_km)
 *   Hourly:         hourly_rate × max(min_hours, hours), with
 *                   km_per_hour × hours included; extra km at per_km and
 *                   waiting beyond the free minutes are settled with the
 *                   driver and are not part of the booking.
 * Then a night surcharge (night_bps) when pickup is in the night window, the
 * online convenience fee (online payments only), and GST at the vehicle
 * type's rate (the fee at its own rate). Fares round to whole rupees.
 */

export type RideFareRule = {
  basePaise: number;
  includedKm: number;
  perKmPaise: number;
  minFarePaise: number;
  hourlyRatePaise: number;
  minHours: number;
  kmPerHour: number;
  freeWaitingMinutes: number;
  perMinWaitingPaise: number;
  /** 10000 = no night surcharge. */
  nightBps: number;
};

export type RideTerms = {
  mode: RideMode;
  /** Kilometres the fare covers (the trip for point to point, the allowance for hourly). */
  includedKm: number;
  hours: number | null;
  extraKmPaise: number;
  freeWaitingMinutes: number;
  perMinWaitingPaise: number;
  night: boolean;
};

export type RideQuoteInput = {
  mode: RideMode;
  rule: RideFareRule;
  distanceKm: number | null;
  hours: number | null;
  pickupAt: Date;
  night: { start: string; end: string };
  /** Invoice text, e.g. "Bike · ISKCON Temple → Banke Bihari Temple". */
  label: string;
  taxBps: number;
  sac: string;
  convenienceFeePaise: number;
  feeTaxBps: number;
  feeSac: string;
};

export type RideQuote = { drafts: DraftLine[]; terms: RideTerms; baseFarePaise: number };

const rupees = (paise: number) => Math.round(paise / 100) * 100;

/** The fare before night charge, fee and tax, in whole rupees. */
export function baseRideFare(
  rule: RideFareRule,
  mode: RideMode,
  trip: { distanceKm: number | null; hours: number | null },
): { farePaise: number; includedKm: number; hours: number | null } {
  if (mode === "hourly") {
    const hours = Math.max(rule.minHours, Math.ceil(trip.hours ?? 1));
    return { farePaise: rupees(rule.hourlyRatePaise * hours), includedKm: rule.kmPerHour * hours, hours };
  }
  const km = Math.max(0, trip.distanceKm ?? 0);
  const extra = Math.max(0, km - rule.includedKm);
  const fare = Math.max(rule.minFarePaise, rule.basePaise + extra * rule.perKmPaise);
  return { farePaise: rupees(fare), includedKm: Math.ceil(km * 10) / 10, hours: null };
}

export function quoteRide(input: RideQuoteInput): RideQuote {
  const { rule } = input;
  const tax = { mode: "fixed" as const, rateBps: input.taxBps };
  const line = (
    key: string,
    kind: DraftLine["kind"],
    description: string,
    amountPaise: number,
    discountable: boolean,
  ): DraftLine => ({
    key,
    kind,
    description,
    date: indiaDate(input.pickupAt),
    roomId: null,
    ratePlanId: null,
    quantity: 1,
    amountPaise,
    discountable,
    tax,
    sac: input.sac,
  });

  const base = baseRideFare(rule, input.mode, { distanceKm: input.distanceKm, hours: input.hours });
  const drafts: DraftLine[] = [line("fare", "fare", input.label, base.farePaise, true)];

  const night = rule.nightBps > 10_000 && isNightTime(input.pickupAt, input.night.start, input.night.end);
  const nightCharge = night ? rupees((base.farePaise * (rule.nightBps - 10_000)) / 10_000) : 0;
  if (nightCharge > 0) drafts.push(line("surcharge:night", "surcharge", "Night charge", nightCharge, true));

  if (input.convenienceFeePaise > 0) {
    drafts.push({
      ...line("fee:convenience", "fee", "Convenience fee", input.convenienceFeePaise, false),
      tax: { mode: "fixed", rateBps: input.feeTaxBps },
      sac: input.feeSac,
    });
  }

  return {
    drafts,
    baseFarePaise: base.farePaise,
    terms: {
      mode: input.mode,
      includedKm: base.includedKm,
      hours: base.hours,
      extraKmPaise: rule.perKmPaise,
      freeWaitingMinutes: rule.freeWaitingMinutes,
      perMinWaitingPaise: rule.perMinWaitingPaise,
      night: nightCharge > 0,
    },
  };
}

export type LatLng = { lat: number; lng: number };

/** Rough road distance and ride time inside town, from coordinates. */
export function estimateRide(
  from: LatLng,
  to: LatLng,
  opts: { roadFactor: number; avgSpeedKmph: number },
): { distanceKm: number; durationMinutes: number } {
  const km = (distanceMeters(from, to) / 1000) * opts.roadFactor;
  const distanceKm = Math.max(0.5, Math.round(km * 10) / 10);
  const durationMinutes = Math.max(5, Math.round((distanceKm / opts.avgSpeedKmph) * 60));
  return { distanceKm, durationMinutes };
}

export type RideZoneArea = { id: string; lat: number; lng: number; radiusKm: number };

/** The zone serving a point: the nearest one whose circle contains it, or null. */
export function findZone<Z extends RideZoneArea>(zones: readonly Z[], at: LatLng): Z | null {
  let best: { zone: Z; km: number } | null = null;
  for (const zone of zones) {
    const km = distanceMeters(zone, at) / 1000;
    if (km <= zone.radiusKm && (!best || km < best.km)) best = { zone, km };
  }
  return best?.zone ?? null;
}
