import { distanceMeters } from "@/lib/geo";
import type { DraftLine } from "@/lib/pricing/booking";
import type { CabTripType } from "@/schemas/cabs";
import { indiaDate, indiaWeekday, isNightTime, tripDays } from "./time";

/**
 * Cab fares. Pure: the results page, the review page and the booking
 * action all run this on catalog rows and settings read on the server, so
 * what the customer sees is what they are charged.
 *
 * How a fare is built (all rates come from the admin catalog):
 *   * Fixed fare: a route with a fare for this category (transfers,
 *     sightseeing tours, popular outstation routes). Allowance is included.
 *   * Per km (outstation without a fixed fare):
 *       one way:    max(min_km, km) × rate
 *       round trip: max(min_km_per_day × days, 2 × km) × rate
 *     plus the driver allowance × days.
 *   * Local hire: the package fare (e.g. 8 hr / 80 km).
 * Then: a peak surcharge on the base fare, a night charge when pickup is
 * in the night window, add-ons and the online convenience fee; GST at the
 * cab rate on everything (the fee at its own rate).
 */

export type FareRule = {
  ratePerKmPaise: number;
  minKm: number;
  minKmPerDay: number;
  driverAllowancePerDayPaise: number;
  nightChargePaise: number;
  extraKmPaise: number;
  tollsIncluded: boolean;
  waitingFreeMinutes: number;
  waitingPerHourPaise: number;
};

export type FareBasis =
  | { kind: "fixed"; farePaise: number; distanceKm: number; extraKmPaise: number; tollsIncluded: boolean }
  | { kind: "per_km"; rule: FareRule; distanceKm: number }
  | {
      kind: "local";
      farePaise: number;
      hours: number;
      km: number;
      extraKmPaise: number;
      extraHourPaise: number;
    };

export type CabAddonOption = { key: string; name: string; pricePaise: number };

export type CabQuoteInput = {
  tripType: CabTripType;
  basis: FareBasis;
  /** Invoice text, e.g. "Sedan · Vrindavan → Agra". */
  label: string;
  pickupAt: Date;
  returnAt: Date | null;
  night: { start: string; end: string; chargePaise: number };
  /** Waiting terms shown on the review page (from the category's fare rule). */
  waiting: { freeMinutes: number; perHourPaise: number };
  /** 10000 = no surcharge. */
  surchargeBps: number;
  addons: readonly CabAddonOption[];
  taxBps: number;
  sac: string;
  convenienceFeePaise: number;
  feeTaxBps: number;
  feeSac: string;
};

/** What the fare includes, for the review page and the booking snapshot. */
export type CabInclusions = {
  includedKm: number;
  extraKmPaise: number;
  extraHourPaise: number | null;
  hours: number | null;
  days: number;
  tollsIncluded: boolean;
  allowanceIncluded: boolean;
  nightCharge: boolean;
  waitingFreeMinutes: number;
  waitingPerHourPaise: number;
};

export type CabQuote = { drafts: DraftLine[]; inclusions: CabInclusions; baseFarePaise: number };

/** Rounds to whole rupees. */
const rupees = (paise: number) => Math.round(paise / 100) * 100;

export function quoteCab(input: CabQuoteInput): CabQuote {
  const { basis, taxBps, sac } = input;
  const tax = { mode: "fixed" as const, rateBps: taxBps };
  const line = (
    key: string,
    kind: DraftLine["kind"],
    description: string,
    amountPaise: number,
    discountable: boolean,
    quantity = 1,
  ): DraftLine => ({
    key,
    kind,
    description,
    date: indiaDate(input.pickupAt),
    roomId: null,
    ratePlanId: null,
    quantity,
    amountPaise,
    discountable,
    tax,
    sac,
  });

  const days = input.tripType === "round_trip" ? tripDays(input.pickupAt, input.returnAt) : 1;
  const drafts: DraftLine[] = [];
  let base: number;
  let allowance = 0;
  let inclusions: Omit<CabInclusions, "nightCharge">;

  if (basis.kind === "per_km") {
    const { rule } = basis;
    const km =
      input.tripType === "round_trip"
        ? Math.max(rule.minKmPerDay * days, Math.ceil(basis.distanceKm * 2))
        : Math.max(rule.minKm, Math.ceil(basis.distanceKm));
    base = km * rule.ratePerKmPaise;
    allowance = rule.driverAllowancePerDayPaise * days;
    inclusions = {
      includedKm: km,
      extraKmPaise: rule.extraKmPaise,
      extraHourPaise: null,
      hours: null,
      days,
      tollsIncluded: rule.tollsIncluded,
      allowanceIncluded: true,
      waitingFreeMinutes: input.waiting.freeMinutes,
      waitingPerHourPaise: input.waiting.perHourPaise,
    };
  } else if (basis.kind === "fixed") {
    base = basis.farePaise;
    inclusions = {
      includedKm: Math.ceil(basis.distanceKm),
      extraKmPaise: basis.extraKmPaise,
      extraHourPaise: null,
      hours: null,
      days,
      tollsIncluded: basis.tollsIncluded,
      allowanceIncluded: true,
      waitingFreeMinutes: input.waiting.freeMinutes,
      waitingPerHourPaise: input.waiting.perHourPaise,
    };
  } else {
    base = basis.farePaise;
    inclusions = {
      includedKm: basis.km,
      extraKmPaise: basis.extraKmPaise,
      extraHourPaise: basis.extraHourPaise,
      hours: basis.hours,
      days: 1,
      tollsIncluded: false,
      allowanceIncluded: true,
      waitingFreeMinutes: 0,
      waitingPerHourPaise: 0,
    };
  }

  drafts.push(line("fare", "fare", input.label, base, true));

  const surcharge = rupees((base * (Math.max(10_000, input.surchargeBps) - 10_000)) / 10_000);
  if (surcharge > 0) drafts.push(line("surcharge:peak", "surcharge", "Peak-time surcharge", surcharge, true));

  if (allowance > 0) {
    drafts.push(
      line(
        "allowance:driver",
        "allowance",
        `Driver allowance × ${days} day${days > 1 ? "s" : ""}`,
        allowance,
        false,
        days,
      ),
    );
  }

  const nightCharge =
    input.tripType !== "local" &&
    input.night.chargePaise > 0 &&
    isNightTime(input.pickupAt, input.night.start, input.night.end);
  if (nightCharge)
    drafts.push(line("surcharge:night", "surcharge", "Night charge", input.night.chargePaise, false));

  for (const addon of input.addons) {
    if (addon.pricePaise > 0)
      drafts.push(line(`addon:${addon.key}`, "addon", addon.name, addon.pricePaise, true));
  }

  if (input.convenienceFeePaise > 0) {
    drafts.push({
      ...line("fee:convenience", "fee", "Convenience fee", input.convenienceFeePaise, false),
      tax: { mode: "fixed", rateBps: input.feeTaxBps },
      sac: input.feeSac,
    });
  }

  return { drafts, inclusions: { ...inclusions, nightCharge }, baseFarePaise: base };
}

export type Surcharge = {
  multiplierBps: number;
  startsOn: string | null;
  endsOn: string | null;
  weekdays: readonly number[];
  tripTypes: readonly CabTripType[];
  categoryIds: readonly string[];
};

/** The highest peak multiplier matching this pickup (10000 when none does). */
export function surchargeBps(
  rules: readonly Surcharge[],
  ctx: { pickupAt: Date; tripType: CabTripType; categoryId: string },
): number {
  const date = indiaDate(ctx.pickupAt);
  const weekday = indiaWeekday(ctx.pickupAt);
  return rules
    .filter(
      (r) =>
        (!r.startsOn || date >= r.startsOn) &&
        (!r.endsOn || date <= r.endsOn) &&
        (r.weekdays.length === 0 || r.weekdays.includes(weekday)) &&
        (r.tripTypes.length === 0 || r.tripTypes.includes(ctx.tripType)) &&
        (r.categoryIds.length === 0 || r.categoryIds.includes(ctx.categoryId)),
    )
    .reduce((best, r) => Math.max(best, r.multiplierBps), 10_000);
}

/**
 * The advance for a part payment: the configured share of the total,
 * rounded up to whole rupees, but at least the minimum advance and never
 * more than the total.
 */
export function cabAdvance(totalPaise: number, percent: number, minAdvancePaise: number): number {
  const share = Math.ceil((totalPaise * percent) / 100 / 100) * 100;
  return Math.min(totalPaise, Math.max(share, minAdvancePaise, 100));
}

/** Rough road distance and drive time from coordinates, when no route row exists. */
export function estimateTrip(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { roadFactor: number; avgSpeedKmph: number },
): { distanceKm: number; durationMinutes: number } {
  const km = (distanceMeters(from, to) / 1000) * opts.roadFactor;
  const distanceKm = Math.max(1, Math.round(km * 10) / 10);
  const durationMinutes = Math.max(10, Math.round(((distanceKm / opts.avgSpeedKmph) * 60) / 5) * 5);
  return { distanceKm, durationMinutes };
}

/** Pickup must be after the lead time and within the booking window; returns must follow pickup. */
export type TimingError =
  "too_soon" | "too_far" | "return_before_pickup" | "trip_too_long" | "missing_return";

export function checkTiming(
  input: { tripType: CabTripType; pickupAt: Date; returnAt: Date | null; now: Date },
  limits: { minLeadMinutes: number; maxAdvanceDays: number; maxTripDays: number },
): TimingError | null {
  const { pickupAt, returnAt, now } = input;
  if (pickupAt.getTime() < now.getTime() + limits.minLeadMinutes * 60_000) return "too_soon";
  if (pickupAt.getTime() > now.getTime() + limits.maxAdvanceDays * 86_400_000) return "too_far";
  if (input.tripType === "round_trip") {
    if (!returnAt) return "missing_return";
    if (returnAt.getTime() <= pickupAt.getTime()) return "return_before_pickup";
    if (tripDays(pickupAt, returnAt) > limits.maxTripDays) return "trip_too_long";
  }
  return null;
}
