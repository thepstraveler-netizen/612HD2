import "server-only";
import type { CabSearchOptions } from "@/components/cabs/cab-search-form";
import { pickLocalized } from "@/lib/i18n/localized";
import type { CabSearch, CabSettings } from "@/schemas/cabs";
import type { CabCatalog, CabRoute } from "./queries";
import { cabOffers, planTrip, type TripPlan } from "./search";
import { cabSearchQuery, defaultPickupAt, earliestPickupAt } from "./ui";
import { toIndiaLocal } from "./time";

/**
 * Server-side view data for the cab pages: the search widget's options and
 * "from" prices, all priced by the same planner the results page uses.
 */

/** Cheapest fitting fare for a search at the default pickup, or null when none is offered. */
export function cheapestFare(
  search: Partial<CabSearch>,
  catalog: CabCatalog,
  settings: CabSettings,
  now: Date,
): number | null {
  const planned = planTrip(
    { type: "one_way", pax: 1, at: defaultPickupAt(now), ...search },
    catalog,
    settings,
    now,
  );
  if (!planned.ok) return null;
  const offers = cabOffers(planned.plan, catalog, settings).filter((o) => o.fits);
  return offers.length ? Math.min(...offers.map((o) => o.totalPaise)) : null;
}

export function cabSearchOptions(
  catalog: CabCatalog,
  settings: CabSettings,
  locale: string,
  now: Date,
): CabSearchOptions {
  const slugOf = (id: string) => catalog.places.find((p) => p.id === id)?.slug;
  return {
    places: catalog.places.map((p) => ({
      slug: p.slug,
      name: pickLocalized(p.name, locale),
      kind: p.kind,
      isPopular: p.isPopular,
    })),
    packages: catalog.packages.map((p) => ({ key: p.key, name: pickLocalized(p.name, locale) })),
    tours: catalog.routes
      .filter((r) => r.tripType === "sightseeing")
      .map((r) => ({
        slug: r.slug,
        name: r.name ? pickLocalized(r.name, locale) : r.slug,
        stops: r.stops,
        durationMinutes: r.durationMinutes,
        distanceKm: r.distanceKm,
        fromPaise: cheapestFare({ type: "sightseeing", route: r.slug }, catalog, settings, now),
      })),
    transferPairs: catalog.routes
      .filter((r) => r.tripType === "transfer")
      .map((r) => [slugOf(r.fromId), slugOf(r.toId)])
      .filter((pair): pair is [string, string] => Boolean(pair[0] && pair[1])),
    maxPassengers: Math.max(1, ...catalog.categories.map((c) => c.seats)),
    minAt: earliestPickupAt(now, settings.min_lead_minutes),
    maxAt: toIndiaLocal(new Date(now.getTime() + settings.max_advance_days * 86_400_000)),
    defaultAt: defaultPickupAt(now),
  };
}

/** "Vrindavan → Agra", "Vrindavan ⇄ Agra", "8 hrs · 80 km · Vrindavan" or the tour name. */
export function planTitle(plan: TripPlan, locale: string): string {
  const from = pickLocalized(plan.from.name, locale);
  if (plan.tripType === "sightseeing" && plan.route)
    return plan.route.name ? pickLocalized(plan.route.name, locale) : plan.route.slug;
  if (plan.tripType === "local" && plan.pkg) return `${pickLocalized(plan.pkg.name, locale)} · ${from}`;
  const to = plan.to ? pickLocalized(plan.to.name, locale) : "";
  return `${from} ${plan.tripType === "round_trip" ? "⇄" : "→"} ${to}`.trim();
}

/** Values for the `cabs.errors.*` messages (lead time, booking window, trip length). */
export function planErrorValues(settings: CabSettings): Record<string, number> {
  return {
    hours: Math.floor(settings.min_lead_minutes / 60),
    minutes: settings.min_lead_minutes % 60,
    days: settings.max_advance_days,
    tripDays: settings.max_trip_days,
  };
}

export type PopularRoute = {
  slug: string;
  type: "one_way" | "transfer" | "sightseeing";
  title: string;
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number;
  fromPaise: number | null;
  query: Record<string, string>;
};

/** Popular outstation routes and transfers, linking straight to results. */
export function popularRoutes(
  catalog: CabCatalog,
  settings: CabSettings,
  locale: string,
  now: Date,
): PopularRoute[] {
  const place = (id: string) => catalog.places.find((p) => p.id === id);
  return catalog.routes
    .filter((r): r is CabRoute & { tripType: "one_way" | "transfer" } =>
      Boolean(r.isPopular && (r.tripType === "one_way" || r.tripType === "transfer")),
    )
    .flatMap((r) => {
      const from = place(r.fromId);
      const to = place(r.toId);
      if (!from || !to) return [];
      const search = { type: r.tripType, from: from.slug, to: to.slug, at: defaultPickupAt(now), pax: 2 };
      const fromName = pickLocalized(from.name, locale);
      const toName = pickLocalized(to.name, locale);
      return [
        {
          slug: r.slug,
          type: r.tripType,
          title: r.name ? pickLocalized(r.name, locale) : `${fromName} → ${toName}`,
          from: fromName,
          to: toName,
          distanceKm: r.distanceKm,
          durationMinutes: r.durationMinutes,
          fromPaise: cheapestFare(search, catalog, settings, now),
          query: cabSearchQuery(search),
        },
      ];
    });
}
