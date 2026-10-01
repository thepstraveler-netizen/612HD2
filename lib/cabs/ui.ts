import { z } from "zod";
import { addDays } from "@/lib/dates";
import type { CabSearch, CabTripType } from "@/schemas/cabs";
import type { Enums } from "@/types/database";
import type { CabInclusions } from "./pricing";
import { indiaDate, toIndiaLocal } from "./time";

/**
 * Pure helpers for the customer and driver cab screens: URL state, place
 * grouping, offer filters, the text keys for inclusions, cancellation and
 * fare lines, and how a trip status is shown. No prices are computed here.
 */

export type TripStatus = Enums<"trip_status">;
export type PlaceKind = Enums<"cab_place_kind">;
export type Tone = "success" | "warning" | "danger" | "info" | "muted";

/** Search widget tabs; "outstation" covers one way and round trips. */
export const CAB_TABS = ["outstation", "local", "transfer", "sightseeing"] as const;
export type CabTab = (typeof CAB_TABS)[number];

export function tabForType(type: CabTripType): CabTab {
  return type === "one_way" || type === "round_trip" ? "outstation" : type;
}

/** Default pickup: tomorrow at 09:00 India time. */
export function defaultPickupAt(now: Date): string {
  return `${addDays(indiaDate(now), 1)}T09:00`;
}

/** Earliest pickup the form offers (lead time, rounded up to the next quarter hour). */
export function earliestPickupAt(now: Date, leadMinutes: number): string {
  const quarter = 15 * 60_000;
  const at = Math.ceil((now.getTime() + leadMinutes * 60_000) / quarter) * quarter;
  return toIndiaLocal(new Date(at));
}

/** The URL query for a search, keeping only the keys its trip type uses. */
export function cabSearchQuery(search: Partial<CabSearch>): Record<string, string> {
  const type = search.type ?? "one_way";
  const keys: (keyof CabSearch)[] =
    type === "local"
      ? ["from", "pkg", "at"]
      : type === "sightseeing"
        ? ["route", "at"]
        : type === "round_trip"
          ? ["from", "to", "at", "back"]
          : ["from", "to", "at"];
  const out: Record<string, string> = { type };
  for (const key of keys) {
    const value = search[key];
    if (value !== undefined && value !== "") out[key] = String(value);
  }
  out.pax = String(search.pax ?? 2);
  return out;
}

export function toQueryString(query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return qs ? `?${qs}` : "";
}

export type PlaceOption = { slug: string; name: string; kind: PlaceKind; isPopular: boolean };
export type PlaceGroup = { group: "popular" | PlaceKind; places: PlaceOption[] };

const KIND_ORDER: PlaceKind[] = ["city", "temple", "landmark", "station", "airport"];

const normalize = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Picker groups: popular places first, then the rest by kind. A search
 * term matches the name or slug and drops the popular group.
 */
export function groupPlaces(places: readonly PlaceOption[], term = ""): PlaceGroup[] {
  const q = normalize(term.trim());
  const matching = q
    ? places.filter((p) => normalize(p.name).includes(q) || p.slug.includes(q.replace(/\s+/g, "-")))
    : places;
  const groups: PlaceGroup[] = [];
  if (!q) {
    const popular = matching.filter((p) => p.isPopular);
    if (popular.length) groups.push({ group: "popular", places: popular });
  }
  for (const kind of KIND_ORDER) {
    const list = matching.filter((p) => p.kind === kind && (q ? true : !p.isPopular));
    if (list.length) groups.push({ group: kind, places: list });
  }
  return groups;
}

export type FilterableOffer = { key: string; models: { name: string; fuel: string }[] };
export type OfferFilters = { categories: string[]; models: string[]; fuels: string[] };

/** Client-side filters over offers: category, and a model matching both the model and fuel picks. */
export function filterOffers<T extends FilterableOffer>(offers: readonly T[], f: OfferFilters): T[] {
  return offers.filter((o) => {
    if (f.categories.length && !f.categories.includes(o.key)) return false;
    if (!f.models.length && !f.fuels.length) return true;
    return o.models.some(
      (m) => (!f.models.length || f.models.includes(m.name)) && (!f.fuels.length || f.fuels.includes(m.fuel)),
    );
  });
}

/** The model shown as "<model> or similar". */
export function featuredModel<M extends { isFeatured: boolean }>(models: readonly M[]): M | undefined {
  return models.find((m) => m.isFeatured) ?? models[0];
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  const m = Math.max(0, Math.round(total));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}

/** One line of "what's included", as a message key under `cabs.inclusions` plus its values. */
export type InclusionItem = {
  key: string;
  included: boolean;
  values?: Record<string, number>;
  /** Paise values to format before passing to the message. */
  money?: Record<string, number>;
};

export function inclusionItems(inc: CabInclusions, tripType: CabTripType): InclusionItem[] {
  const items: InclusionItem[] = [{ key: "km", included: true, values: { km: inc.includedKm } }];
  if (inc.hours) items.push({ key: "hours", included: true, values: { hours: inc.hours } });
  if (inc.allowanceIncluded)
    items.push(
      inc.days > 1
        ? { key: "allowanceDays", included: true, values: { days: inc.days } }
        : { key: "allowance", included: true },
    );
  items.push({ key: inc.tollsIncluded ? "tollsIncluded" : "tollsExtra", included: inc.tollsIncluded });
  if (inc.nightCharge) items.push({ key: "nightCharge", included: true });
  if (inc.extraKmPaise > 0)
    items.push({ key: "extraKm", included: false, money: { rate: inc.extraKmPaise } });
  if (inc.extraHourPaise)
    items.push({ key: "extraHour", included: false, money: { rate: inc.extraHourPaise } });
  if (tripType !== "local" && inc.waitingFreeMinutes > 0)
    items.push({ key: "waitingFree", included: true, values: { minutes: inc.waitingFreeMinutes } });
  if (tripType !== "local" && inc.waitingPerHourPaise > 0)
    items.push({ key: "waitingCharge", included: false, money: { rate: inc.waitingPerHourPaise } });
  return items;
}

export type CancellationRule = { hours_before: number; refund_percent: number };
export type CancellationItem = {
  key: "full" | "partial" | "untilPickup" | "none";
  hours: number;
  percent: number;
};

/** Refund tiers, longest notice first, as message keys under `cabs.cancellation`. */
export function cancellationItems(rules: readonly CancellationRule[]): CancellationItem[] {
  return [...rules]
    .sort((a, b) => b.hours_before - a.hours_before)
    .map((r) => ({
      key:
        r.refund_percent <= 0
          ? "none"
          : r.hours_before <= 0
            ? "untilPickup"
            : r.refund_percent >= 100
              ? "full"
              : "partial",
      hours: r.hours_before,
      percent: r.refund_percent,
    }));
}

/** Hours of notice for a full refund (the shortest such tier), or null when none is full. */
export function freeCancellationHours(rules: readonly CancellationRule[]): number | null {
  const full = rules.filter((r) => r.refund_percent >= 100).map((r) => r.hours_before);
  return full.length ? Math.min(...full) : null;
}

/** Fare breakup line → message key under `cabs.lines` (add-ons carry their key). */
export function fareLineKey(key: string): { label: string; addon?: string } {
  if (key === "fare") return { label: "fare" };
  if (key === "surcharge:peak") return { label: "peak" };
  if (key === "surcharge:night") return { label: "night" };
  if (key.startsWith("allowance:")) return { label: "allowance" };
  if (key.startsWith("fee:")) return { label: "fee" };
  if (key.startsWith("addon:")) return { label: "addon", addon: key.slice(6) };
  return { label: "other" };
}

export function tripStatusTone(status: TripStatus): Tone {
  switch (status) {
    case "awaiting_payment":
    case "unassigned":
      return "warning";
    case "assigned":
    case "en_route":
    case "arrived":
    case "picked_up":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
    case "no_show":
      return "danger";
  }
}

const BEFORE_PICKUP: readonly TripStatus[] = ["unassigned", "assigned", "en_route", "arrived"];

/** The pickup OTP is shown once the trip is paid and until the driver has picked the customer up. */
export function showPickupOtp(bookingStatus: string, tripStatus: TripStatus | null, otp: string | null) {
  return (
    Boolean(otp) && bookingStatus === "confirmed" && tripStatus !== null && BEFORE_PICKUP.includes(tripStatus)
  );
}

/** Customers may cancel online until the driver has set off. */
export function tripAllowsCancel(tripStatus: TripStatus | null): boolean {
  return (
    tripStatus === null ||
    tripStatus === "awaiting_payment" ||
    tripStatus === "unassigned" ||
    tripStatus === "assigned"
  );
}

/** The driver's buttons for the next steps (from DRIVER_NEXT), primary first. */
export type DriverAction = { status: TripStatus; primary: boolean; needsOtp: boolean };

export function driverActions(next: readonly TripStatus[], requireOtp: boolean): DriverAction[] {
  return next.map((status) => ({
    status,
    primary: status !== "no_show",
    needsOtp: status === "picked_up" && requireOtp,
  }));
}

/** Date and time in India, e.g. "Fri, 2 Oct, 9:00 am". */
export function formatIndiaDateTime(at: Date | string, locale: string, withYear = false): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(typeof at === "string" ? new Date(at) : at);
}

export function formatIndiaTime(at: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(typeof at === "string" ? new Date(at) : at);
}

const localized = z.object({ en: z.string(), hi: z.string().nullish() });

/** The cab part of a booking snapshot (written by lib/cabs/service), read leniently. */
const cabSnapshotSchema = z.object({
  trip: z.object({
    type: z.enum(["one_way", "round_trip", "local", "transfer", "sightseeing"]),
    label: z.string().default(""),
    route: z.string().default(""),
    vehicle: z.string().default(""),
    from: z.object({ slug: z.string(), name: localized }).nullish(),
    to: z.object({ slug: z.string(), name: localized }).nullish(),
    pickupAt: z.string(),
    returnAt: z.string().nullish(),
    distanceKm: z.number().nullish(),
    durationMinutes: z.number().nullish(),
    stops: z.array(z.string()).default([]),
  }),
  category: z.object({ key: z.string(), name: localized, seats: z.number() }).partial().nullish(),
  inclusions: z
    .object({
      includedKm: z.number(),
      extraKmPaise: z.number(),
      extraHourPaise: z.number().nullable(),
      hours: z.number().nullable(),
      days: z.number(),
      tollsIncluded: z.boolean(),
      allowanceIncluded: z.boolean(),
      nightCharge: z.boolean(),
      waitingFreeMinutes: z.number(),
      waitingPerHourPaise: z.number(),
    })
    .nullish(),
  cancellationRules: z.array(z.object({ hours_before: z.number(), refund_percent: z.number() })).default([]),
});
export type CabSnapshot = z.output<typeof cabSnapshotSchema>;

export function cabSnapshot(snapshot: unknown): CabSnapshot | null {
  const parsed = cabSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}
