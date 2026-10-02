import "server-only";
import { earliestPickupAt } from "@/lib/cabs/ui";
import { toIndiaLocal } from "@/lib/cabs/time";
import { pickLocalized } from "@/lib/i18n/localized";
import type { RideSettings } from "@/schemas/rides";
import type { RideCatalog } from "./queries";
import { rideOffers, type RidePlace, type RidePlan } from "./search";
import type { RidePointKind, RidePointOption, RideZoneOption } from "./ui";

/**
 * Server-side view data for the ride pages: the search form's options and
 * the priced offers, all from the same planner the review page and the
 * booking action use.
 */

export type RideTypeOption = {
  key: string;
  name: string;
  description: string | null;
  icon: string;
  seats: number;
  instantBook: boolean;
};

export type RideSearchOptions = {
  types: RideTypeOption[];
  points: RidePointOption[];
  zones: RideZoneOption[];
  maxHours: number;
  maxPassengers: number;
  minAt: string;
  maxAt: string;
  /** Default for "Schedule": the earliest bookable time. */
  defaultAt: string;
};

export function rideSearchOptions(
  catalog: RideCatalog,
  settings: RideSettings,
  locale: string,
  now: Date,
): RideSearchOptions {
  const zoneSlug = new Map(catalog.zones.map((z) => [z.id, z.slug]));
  const minAt = earliestPickupAt(now, Math.max(settings.min_lead_minutes, 15));
  return {
    types: catalog.types.map((t) => ({
      key: t.key,
      name: pickLocalized(t.name, locale),
      description: t.description ? pickLocalized(t.description, locale) : null,
      icon: t.icon,
      seats: t.seats,
      instantBook: t.instantBook,
    })),
    points: catalog.points.flatMap((p) => {
      const zone = zoneSlug.get(p.zoneId);
      return zone
        ? [
            {
              slug: p.slug,
              name: pickLocalized(p.name, locale),
              kind: p.kind as RidePointKind,
              isPopular: p.isPopular,
              zone,
            },
          ]
        : [];
    }),
    zones: catalog.zones.map((z) => ({ slug: z.slug, name: pickLocalized(z.name, locale) })),
    maxHours: settings.max_hours,
    maxPassengers: Math.max(1, ...catalog.types.map((t) => t.seats)),
    minAt,
    maxAt: toIndiaLocal(new Date(now.getTime() + settings.max_advance_days * 86_400_000)),
    defaultAt: minAt,
  };
}

/** A landmark's name, or null for "my location" (the caller shows its own label). */
export function placeName(p: RidePlace, locale: string): string | null {
  return p.point ? pickLocalized(p.point.name, locale) : null;
}

export type RideResultOffer = {
  key: string;
  name: string;
  description: string | null;
  icon: string;
  seats: number;
  instantBook: boolean;
  fits: boolean;
  /** Fare incl. GST, before coupons and the online convenience fee. */
  totalPaise: number;
  includedKm: number;
  extraKmPaise: number;
  freeWaitingMinutes: number;
  perMinWaitingPaise: number;
  night: boolean;
};

/** One priced card per vehicle type serving this ride; the chosen type first. */
export function rideResultOffers(
  plan: RidePlan,
  catalog: RideCatalog,
  settings: RideSettings,
  locale: string,
  chosen?: string,
): RideResultOffer[] {
  const offers = rideOffers(plan, catalog, settings).map((o) => ({
    key: o.type.key,
    name: pickLocalized(o.type.name, locale),
    description: o.type.description ? pickLocalized(o.type.description, locale) : null,
    icon: o.type.icon,
    seats: o.type.seats,
    instantBook: o.type.instantBook,
    fits: o.fits,
    totalPaise: o.totalPaise,
    includedKm: o.terms.includedKm,
    extraKmPaise: o.terms.extraKmPaise,
    freeWaitingMinutes: o.terms.freeWaitingMinutes,
    perMinWaitingPaise: o.terms.perMinWaitingPaise,
    night: o.terms.night,
  }));
  if (!chosen) return offers;
  return [...offers.filter((o) => o.key === chosen), ...offers.filter((o) => o.key !== chosen)];
}
