import type { Tone } from "@/components/admin/booking-status";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import type { IsoDate } from "@/lib/dates";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { paiseToRupeesInput } from "@/lib/money";
import type { LeadsSettings } from "@/schemas/leads";
import type {
  DepartureForm,
  DepartureFormInput,
  ItineraryDayForm,
  ItineraryDayFormInput,
  LeadsSettingsForm,
  LeadsSettingsFormInput,
  LocalizedListRowInput,
  PackageForm,
  PackageFormInput,
  PackagesSettingsForm,
  PackagesSettingsFormInput,
  PackageStatus,
  PricingTierForm,
  PricingTierFormInput,
  TravelSettingsForm,
  TravelSettingsFormInput,
} from "@/schemas/package-admin";
import type { PackagesSettings, TravelSettings } from "@/schemas/packages";
import type { Tables, TablesInsert } from "@/types/database";
import { checkTiers, type TierProblem } from "./pricing";

/**
 * Pure helpers behind the packages admin: validated form values ↔ table
 * rows (rupees ↔ paise, % ↔ basis points, localized lists), tier coverage
 * checks, seats booked / left per departure and the Settings → Packages &
 * leads values. Unit-tested; the server code only reads and writes.
 */

const emptyLocalized = { en: "", hi: "" };

function localizedInput(value: LocalizedJson | null | undefined) {
  return value ? { en: value.en, hi: value.hi ?? "" } : emptyLocalized;
}

function localizedListInput(list: readonly LocalizedJson[]): LocalizedListRowInput[] {
  return list.map((v) => ({ en: v.en, hi: v.hi ?? "" }));
}

// ---------------------------------------------------------------- packages

export function packageRow(form: PackageForm): TablesInsert<"packages"> {
  return {
    slug: form.slug,
    title: form.title,
    summary: form.summary,
    description: form.description,
    terms: form.terms,
    category: form.category,
    destinations: form.destinations,
    start_city: form.start_city,
    duration_days: form.duration_days,
    duration_nights: form.duration_nights,
    image_id: form.image_id,
    // The cover is shown on its own; keep it out of the gallery.
    gallery_ids: [...new Set(form.gallery_ids)].filter((id) => id !== form.image_id),
    highlights: form.highlights,
    inclusions: form.inclusions,
    exclusions: form.exclusions,
    booking_mode: form.booking_mode,
    fixed_departures: form.fixed_departures,
    min_pax: form.min_pax,
    max_pax: form.max_pax,
    advance_percent: form.advance_percent,
    tax_bps: percentToBps(form.gst_percent),
    sac: form.sac,
    is_featured: form.is_featured,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export const NEW_PACKAGE: PackageFormInput = {
  slug: "",
  title: emptyLocalized,
  summary: emptyLocalized,
  description: emptyLocalized,
  terms: emptyLocalized,
  category: "pilgrimage",
  destinations: "",
  start_city: "",
  duration_days: 2,
  duration_nights: 1,
  image_id: "",
  gallery_ids: [],
  highlights: [],
  inclusions: [],
  exclusions: [],
  booking_mode: "enquiry",
  fixed_departures: false,
  min_pax: 1,
  max_pax: 12,
  advance_percent: "",
  // GST on tour operator services, without ITC.
  gst_percent: "5",
  sac: "998555",
  is_featured: false,
  // New packages start hidden until tiers and photos are in.
  is_active: false,
  sort_order: 100,
};

export function packageFormValues(p: Tables<"packages">): PackageFormInput {
  return {
    id: p.id,
    slug: p.slug,
    title: localizedInput(p.title),
    summary: localizedInput(p.summary),
    description: localizedInput(p.description),
    terms: localizedInput(p.terms),
    category: p.category,
    destinations: p.destinations.join(", "),
    start_city: p.start_city ?? "",
    duration_days: p.duration_days,
    duration_nights: p.duration_nights,
    image_id: p.image_id ?? "",
    gallery_ids: [...p.gallery_ids],
    highlights: localizedListInput(p.highlights),
    inclusions: localizedListInput(p.inclusions),
    exclusions: localizedListInput(p.exclusions),
    booking_mode: p.booking_mode,
    fixed_departures: p.fixed_departures,
    min_pax: p.min_pax,
    max_pax: p.max_pax,
    advance_percent: p.advance_percent === null ? "" : String(p.advance_percent),
    gst_percent: bpsToPercentInput(p.tax_bps),
    sac: p.sac,
    is_featured: p.is_featured,
    is_active: p.is_active,
    sort_order: p.sort_order,
  };
}

export function packageStatus(p: Pick<Tables<"packages">, "is_active" | "deleted_at">): PackageStatus {
  if (p.deleted_at) return "archived";
  return p.is_active ? "live" : "hidden";
}

export function packageStatusTone(status: PackageStatus): Tone {
  return status === "live" ? "success" : status === "hidden" ? "warning" : "muted";
}

// ---------------------------------------------------------------- itinerary

export function itineraryDayRow(form: ItineraryDayForm): TablesInsert<"package_itinerary_days"> {
  return {
    package_id: form.package_id,
    day_number: form.day_number,
    title: form.title,
    description: form.description,
    meals: form.meals,
    overnight: form.overnight,
  };
}

export function itineraryDayFormValues(d: Tables<"package_itinerary_days">): ItineraryDayFormInput {
  return {
    id: d.id,
    package_id: d.package_id,
    day_number: d.day_number,
    title: localizedInput(d.title),
    description: localizedInput(d.description),
    meals: [...d.meals],
    overnight: d.overnight ?? "",
  };
}

/** The next day after the last one (capped at 60). */
export function newItineraryDayValues(
  packageId: string,
  days: readonly Pick<Tables<"package_itinerary_days">, "day_number">[],
): ItineraryDayFormInput {
  const last = days.reduce((max, d) => Math.max(max, d.day_number), 0);
  return {
    package_id: packageId,
    day_number: Math.min(60, last + 1),
    title: emptyLocalized,
    description: emptyLocalized,
    meals: [],
    overnight: "",
  };
}

/** Day numbers the package's duration does not reach, or missing in between (1…days). */
export function itineraryGaps(days: readonly { day_number: number }[], durationDays: number) {
  const have = new Set(days.map((d) => d.day_number));
  const missing: number[] = [];
  for (let d = 1; d <= durationDays; d++) if (!have.has(d)) missing.push(d);
  const extra = [...have].filter((d) => d > durationDays).sort((a, b) => a - b);
  return { missing, extra };
}

// ---------------------------------------------------------------- pricing tiers

export function tierRow(form: PricingTierForm): TablesInsert<"package_pricing_tiers"> {
  return {
    package_id: form.package_id,
    min_pax: form.min_pax,
    max_pax: form.max_pax,
    adult_price_paise: form.adult_price,
    child_price_paise: form.child_price,
  };
}

export function tierFormValues(t: Tables<"package_pricing_tiers">): PricingTierFormInput {
  return {
    id: t.id,
    package_id: t.package_id,
    min_pax: t.min_pax,
    max_pax: t.max_pax,
    adult_price: paiseToRupeesInput(t.adult_price_paise),
    child_price: paiseToRupeesInput(t.child_price_paise),
  };
}

/** Starts where the last tier ends, up to the package's maximum group. */
export function newTierValues(
  packageId: string,
  tiers: readonly Pick<Tables<"package_pricing_tiers">, "max_pax">[],
  pkg: Pick<Tables<"packages">, "min_pax" | "max_pax">,
): PricingTierFormInput {
  const last = tiers.reduce((max, t) => Math.max(max, t.max_pax), 0);
  const min = Math.min(100, last ? last + 1 : pkg.min_pax);
  return {
    package_id: packageId,
    min_pax: min,
    max_pax: Math.max(min, pkg.max_pax),
    adult_price: "",
    child_price: "",
  };
}

export type TierRange = { id?: string; minPax: number; maxPax: number };

/** Keys under packagesAdmin.errors for each tier problem. */
export const TIER_PROBLEM_KEYS: Record<TierProblem, string> = {
  empty: "tiersEmpty",
  overlap: "tiersOverlap",
  gap: "tiersGap",
  range: "tiersRange",
};

/** The package's tiers with `next` saved over the tier it edits (or added). */
export function tiersWith(tiers: readonly TierRange[], next: TierRange): TierRange[] {
  return [...tiers.filter((t) => !next.id || t.id !== next.id), next];
}

/**
 * What blocks saving a tier: a bad range or an overlap with another tier.
 * A gap is allowed while tiers are being built (the editor warns about it,
 * and a package cannot go live for online booking until tiers cover it).
 */
export function tierSaveProblem(
  tiers: readonly TierRange[],
  next: TierRange,
  pkg: { minPax: number; maxPax: number },
): "overlap" | "range" | null {
  const problem = checkTiers(tiersWith(tiers, next), pkg.minPax, pkg.maxPax);
  return problem === "overlap" || problem === "range" ? problem : null;
}

/** "from ₹…": the lowest adult price, or null without tiers. */
export function lowestAdultPrice(tiers: readonly { adult_price_paise: number }[]): number | null {
  return tiers.length ? Math.min(...tiers.map((t) => t.adult_price_paise)) : null;
}

// ---------------------------------------------------------------- departures and seats

export function departureRow(form: DepartureForm): TablesInsert<"package_departures"> {
  return {
    package_id: form.package_id,
    start_date: form.start_date,
    seats_total: form.seats_total,
    supplement_paise: form.supplement,
    note: form.note,
    is_active: form.is_active,
  };
}

export function departureFormValues(d: Tables<"package_departures">): DepartureFormInput {
  return {
    id: d.id,
    package_id: d.package_id,
    start_date: d.start_date,
    seats_total: d.seats_total === null ? "" : String(d.seats_total),
    supplement: paiseToRupeesInput(d.supplement_paise),
    note: localizedInput(d.note),
    is_active: d.is_active,
  };
}

export function newDepartureValues(packageId: string, seats: number | null = null): DepartureFormInput {
  return {
    package_id: packageId,
    start_date: "",
    seats_total: seats === null ? "" : String(seats),
    supplement: "0",
    note: emptyLocalized,
    is_active: true,
  };
}

/** Booking statuses that hold seats: confirmed trips, and unpaid holds until they expire. */
export function isLiveBooking(
  b: { status: Tables<"bookings">["status"]; expires_at: string | null },
  now: number = Date.now(),
): boolean {
  if (b.status === "confirmed" || b.status === "completed") return true;
  return (
    (b.status === "draft" || b.status === "pending_payment") &&
    b.expires_at !== null &&
    Date.parse(b.expires_at) > now
  );
}

export type LiveBooking = { package_id: string; departure_id: string | null; pax: number };

/** Travellers booked per departure. */
export function seatsBookedByDeparture(bookings: readonly LiveBooking[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookings) {
    if (b.departure_id) out.set(b.departure_id, (out.get(b.departure_id) ?? 0) + b.pax);
  }
  return out;
}

/** Live bookings per package. */
export function bookingsByPackage(bookings: readonly LiveBooking[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookings) out.set(b.package_id, (out.get(b.package_id) ?? 0) + 1);
  return out;
}

/**
 * Seats left on a departure: the database's count (package_departure_seats,
 * active future departures of live packages) when it has one, else the
 * same rule over the live bookings read here. Null = no seat limit.
 */
export function seatsLeft(
  seatsTotal: number | null,
  booked: number,
  fromDatabase: number | null | undefined,
): number | null {
  if (seatsTotal === null) return null;
  if (fromDatabase !== undefined && fromDatabase !== null) return fromDatabase;
  return Math.max(0, seatsTotal - booked);
}

/** The first active departure on or after today. */
export function nextDepartureDate(
  departures: readonly Pick<Tables<"package_departures">, "start_date" | "is_active">[],
  today: IsoDate,
): IsoDate | null {
  return (
    departures
      .filter((d) => d.is_active && d.start_date >= today)
      .map((d) => d.start_date)
      .sort()[0] ?? null
  );
}

// ---------------------------------------------------------------- settings

export function packagesSettingsValue(form: PackagesSettingsForm): PackagesSettings {
  return {
    advance_percent: form.advance_percent,
    hold_minutes: form.hold_minutes,
    book_until_days: form.book_until_days,
    max_travellers: form.max_travellers,
    cancellation_policy: form.cancellation_policy,
  };
}

export function packagesSettingsFormValues(s: PackagesSettings): PackagesSettingsFormInput {
  return {
    advance_percent: s.advance_percent,
    hold_minutes: s.hold_minutes,
    book_until_days: s.book_until_days,
    max_travellers: s.max_travellers,
    cancellation_policy: localizedInput(s.cancellation_policy),
  };
}

export function leadsSettingsValue(form: LeadsSettingsForm): LeadsSettings {
  return {
    auto_assign: form.auto_assign,
    max_per_phone_per_hour: form.max_per_phone_per_hour,
    first_follow_up_hours: form.first_follow_up_hours,
    quote_valid_hours: form.quote_valid_hours,
    quote_tax_bps: percentToBps(form.quote_gst_percent),
    quote_sac: form.quote_sac,
    sources: form.sources,
    lost_reasons: form.lost_reasons,
  };
}

export function leadsSettingsFormValues(s: LeadsSettings): LeadsSettingsFormInput {
  return {
    auto_assign: s.auto_assign,
    max_per_phone_per_hour: s.max_per_phone_per_hour,
    first_follow_up_hours: s.first_follow_up_hours,
    quote_valid_hours: s.quote_valid_hours,
    quote_gst_percent: bpsToPercentInput(s.quote_tax_bps),
    quote_sac: s.quote_sac,
    sources: s.sources.join("\n"),
    lost_reasons: s.lost_reasons.join("\n"),
  };
}

/** The provider is kept as stored: only "manual" exists, and it is not edited here. */
export function travelSettingsValue(form: TravelSettingsForm, provider: string): TravelSettings {
  return {
    provider,
    max_travellers: form.max_travellers,
    classes: { flight: form.flight_classes, train: form.train_classes, bus: form.bus_classes },
    notice: form.notice,
  };
}

export function travelSettingsFormValues(s: TravelSettings): TravelSettingsFormInput {
  return {
    max_travellers: s.max_travellers,
    flight_classes: s.classes.flight.join(", "),
    train_classes: s.classes.train.join(", "),
    bus_classes: s.classes.bus.join(", "),
    notice: localizedInput(s.notice),
  };
}
