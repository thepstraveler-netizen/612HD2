import { finalizePrice } from "@/lib/pricing/booking";
import type { CabSearch, CabSettings, CabTripType } from "@/schemas/cabs";
import {
  checkTiming,
  estimateTrip,
  quoteCab,
  surchargeBps,
  type CabAddonOption,
  type CabQuote,
  type FareBasis,
  type TimingError,
} from "./pricing";
import type { CabCatalog, CabCategory, CabPackage, CabPlace, CabRoute } from "./queries";
import { fromIndiaLocal } from "./time";

/**
 * Turns a search (from the URL) into a priced trip per car category. Pure,
 * over the catalog and settings, so the results page, review page and
 * booking action agree.
 */

export type TripPlan = {
  tripType: CabTripType;
  from: CabPlace;
  to: CabPlace | null;
  route: CabRoute | null;
  pkg: CabPackage | null;
  pickupAt: Date;
  returnAt: Date | null;
  passengers: number;
  distanceKm: number;
  durationMinutes: number;
  /** "route" = admin-entered distance; "estimate" = straight line × road factor. */
  distanceSource: "route" | "estimate" | "package";
};

export type PlanError = "incomplete" | "unknown_place" | "same_place" | "no_route" | TimingError;

export type PlanResult = { ok: true; plan: TripPlan } | { ok: false; error: PlanError };

const findRoute = (catalog: CabCatalog, type: CabRoute["tripType"], fromId: string, toId: string) =>
  catalog.routes.find((r) => r.tripType === type && r.fromId === fromId && r.toId === toId) ?? null;

export function planTrip(
  search: CabSearch,
  catalog: CabCatalog,
  settings: CabSettings,
  now: Date,
): PlanResult {
  const place = (slug: string | undefined) =>
    slug ? catalog.places.find((p) => p.slug === slug) : undefined;
  const pickupAt = search.at ? fromIndiaLocal(search.at) : null;
  if (!pickupAt) return { ok: false, error: "incomplete" };
  const returnAt = search.type === "round_trip" && search.back ? fromIndiaLocal(search.back) : null;

  let from: CabPlace | undefined;
  let to: CabPlace | null = null;
  let route: CabRoute | null = null;
  let pkg: CabPackage | null = null;

  if (search.type === "sightseeing") {
    route = catalog.routes.find((r) => r.tripType === "sightseeing" && r.slug === search.route) ?? null;
    if (!route) return { ok: false, error: search.route ? "no_route" : "incomplete" };
    from = catalog.places.find((p) => p.id === route?.fromId);
    to = catalog.places.find((p) => p.id === route?.toId) ?? null;
  } else if (search.type === "local") {
    if (!search.from || !search.pkg) return { ok: false, error: "incomplete" };
    from = place(search.from);
    pkg = catalog.packages.find((p) => p.key === search.pkg) ?? null;
    if (!pkg) return { ok: false, error: "no_route" };
  } else {
    if (!search.from || !search.to) return { ok: false, error: "incomplete" };
    from = place(search.from);
    to = place(search.to) ?? null;
    if (!from || !to) return { ok: false, error: "unknown_place" };
    if (from.id === to.id) return { ok: false, error: "same_place" };
    route = findRoute(catalog, search.type === "transfer" ? "transfer" : "one_way", from.id, to.id);
    if (search.type === "transfer" && !route) return { ok: false, error: "no_route" };
  }
  if (!from) return { ok: false, error: "unknown_place" };

  const timing = checkTiming(
    { tripType: search.type, pickupAt, returnAt, now },
    {
      minLeadMinutes: settings.min_lead_minutes,
      maxAdvanceDays: settings.max_advance_days,
      maxTripDays: settings.max_trip_days,
    },
  );
  if (timing) return { ok: false, error: timing };

  let distanceKm: number;
  let durationMinutes: number;
  let distanceSource: TripPlan["distanceSource"];
  if (pkg) {
    distanceKm = pkg.km;
    durationMinutes = pkg.hours * 60;
    distanceSource = "package";
  } else if (route) {
    distanceKm = route.distanceKm;
    durationMinutes = route.durationMinutes;
    distanceSource = "route";
  } else {
    const estimate = estimateTrip(from, to ?? from, {
      roadFactor: settings.road_factor,
      avgSpeedKmph: settings.avg_speed_kmph,
    });
    distanceKm = estimate.distanceKm;
    durationMinutes = estimate.durationMinutes;
    distanceSource = "estimate";
  }

  return {
    ok: true,
    plan: {
      tripType: search.type,
      from,
      to,
      route,
      pkg,
      pickupAt,
      returnAt,
      passengers: search.pax,
      distanceKm,
      durationMinutes,
      distanceSource,
    },
  };
}

/** How this category is priced for the plan, or null when it isn't offered. */
export function fareBasis(plan: TripPlan, category: CabCategory): FareBasis | null {
  const { route } = plan;
  switch (plan.tripType) {
    case "one_way": {
      const fixed = route?.fares[category.id];
      if (fixed) return { kind: "fixed", distanceKm: plan.distanceKm, ...fixed };
      const rule = category.rules.one_way;
      return rule ? { kind: "per_km", rule, distanceKm: plan.distanceKm } : null;
    }
    case "round_trip": {
      const rule = category.rules.round_trip;
      return rule ? { kind: "per_km", rule, distanceKm: plan.distanceKm } : null;
    }
    case "transfer":
    case "sightseeing": {
      const fixed = route?.fares[category.id];
      return fixed ? { kind: "fixed", distanceKm: plan.distanceKm, ...fixed } : null;
    }
    case "local": {
      const fare = plan.pkg?.fares[category.id];
      return fare && plan.pkg ? { kind: "local", hours: plan.pkg.hours, km: plan.pkg.km, ...fare } : null;
    }
  }
}

/** English trip text for invoices and the booking snapshot. */
export function tripLabel(plan: TripPlan, category: CabCategory): string {
  const car = category.name.en;
  if (plan.tripType === "sightseeing" && plan.route)
    return `${car} · ${plan.route.name?.en ?? plan.route.slug}`;
  if (plan.tripType === "local" && plan.pkg) return `${car} · ${plan.pkg.name.en} · ${plan.from.name.en}`;
  const arrow = plan.tripType === "round_trip" ? "⇄" : "→";
  return `${car} · ${plan.from.name.en} ${arrow} ${plan.to?.name.en ?? ""}`.trim();
}

/** Add-ons offered for this trip type and category. */
export function addonsFor(catalog: CabCatalog, tripType: CabTripType, categoryId: string) {
  return catalog.addons.filter(
    (a) =>
      (a.tripTypes.length === 0 || a.tripTypes.includes(tripType)) &&
      (a.categoryIds.length === 0 || a.categoryIds.includes(categoryId)),
  );
}

export type FeeTerms = { convenienceFeePaise: number; feeTaxBps: number; feeSac: string };

export function quoteCategory(
  plan: TripPlan,
  category: CabCategory,
  catalog: CabCatalog,
  settings: CabSettings,
  opts: { addons: readonly CabAddonOption[]; fee: FeeTerms | null },
): CabQuote | null {
  const basis = fareBasis(plan, category);
  if (!basis) return null;
  const rule = plan.tripType === "round_trip" ? category.rules.round_trip : category.rules.one_way;
  return quoteCab({
    tripType: plan.tripType,
    basis,
    label: tripLabel(plan, category),
    pickupAt: plan.pickupAt,
    returnAt: plan.returnAt,
    night: { start: settings.night_start, end: settings.night_end, chargePaise: rule?.nightChargePaise ?? 0 },
    waiting: { freeMinutes: rule?.waitingFreeMinutes ?? 0, perHourPaise: rule?.waitingPerHourPaise ?? 0 },
    surchargeBps: surchargeBps(catalog.surcharges, {
      pickupAt: plan.pickupAt,
      tripType: plan.tripType,
      categoryId: category.id,
    }),
    addons: opts.addons,
    taxBps: settings.tax_bps,
    sac: settings.sac,
    convenienceFeePaise: opts.fee?.convenienceFeePaise ?? 0,
    feeTaxBps: opts.fee?.feeTaxBps ?? 0,
    feeSac: opts.fee?.feeSac ?? settings.sac,
  });
}

export type CabOffer = {
  category: CabCategory;
  /** Fare incl. GST, before coupons and the convenience fee. */
  totalPaise: number;
  quote: CabQuote;
  fits: boolean;
};

/** One priced offer per category that serves this trip, cheapest first. */
export function cabOffers(plan: TripPlan, catalog: CabCatalog, settings: CabSettings): CabOffer[] {
  return catalog.categories
    .map((category) => {
      const quote = quoteCategory(plan, category, catalog, settings, { addons: [], fee: null });
      if (!quote) return null;
      return {
        category,
        quote,
        totalPaise: finalizePrice(quote.drafts, 0, []).totalPaise,
        fits: category.seats >= plan.passengers,
      };
    })
    .filter((o): o is CabOffer => o !== null)
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.totalPaise - b.totalPaise);
}
