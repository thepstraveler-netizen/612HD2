import { z } from "zod";
import type { IsoDate } from "@/lib/dates";
import { TRAVEL_MODES, type PackageBookingMode, type TravelMode } from "@/schemas/packages";
import { departureState, firstBookableDate, type DepartureState } from "./pricing";
import type { Departure, PackageSummary, PricingTier } from "./types";

/**
 * Pure helpers for the public package and travel pages, the package
 * checkout URL and the My Trips views. Prices shown from here are catalog
 * figures for display; the checkout always asks the server.
 */

export const PACKAGE_CHECKOUT_PATH = "/checkout/package";

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Categories present in the listing, in catalog order (featured first). */
export function packageCategories(packages: readonly Pick<PackageSummary, "category">[]): string[] {
  return [...new Set(packages.map((p) => p.category))];
}

/** Listing filter: category chip plus the free text the home search card sends (`q`). */
export function filterPackages<T extends Pick<PackageSummary, "category" | "destinations" | "title">>(
  packages: readonly T[],
  filter: { category?: string | null; q?: string | null },
): T[] {
  const q = filter.q?.trim().toLowerCase() ?? "";
  return packages.filter((p) => {
    if (filter.category && p.category !== filter.category) return false;
    if (!q) return true;
    const haystack = [p.title.en, p.title.hi ?? "", ...p.destinations].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/** What a package card or page offers: online booking only when the package allows it and the flag is on. */
export function packageAction(bookingMode: PackageBookingMode, bookingOpen: boolean): "book" | "enquire" {
  return bookingMode === "book" && bookingOpen ? "book" : "enquire";
}

/** Readable label for a free-form category slug when no translation exists (`"char-dham"` → `"Char dham"`). */
export function humanizeSlug(slug: string): string {
  const text = slug.replace(/[-_]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : slug;
}

export type DepartureRow = Departure & { state: DepartureState };

/** Upcoming departures with whether each can still be booked online for this group. */
export function departureRows(
  departures: readonly Departure[],
  pax: number,
  today: IsoDate,
  bookUntilDays: number,
): DepartureRow[] {
  return [...departures]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((d) => ({ ...d, state: departureState(d, pax, today, bookUntilDays) }));
}

/** Tiers in group-size order, for the price table. */
export function sortedTiers(tiers: readonly PricingTier[]): PricingTier[] {
  return [...tiers].sort((a, b) => a.minPax - b.minPax);
}

/** What the booking widget sends to the checkout page. */
export type PackageCheckoutRequest = {
  packageSlug: string;
  departureId?: string;
  startDate: string;
  adults: number;
  children: number;
};

export function packageCheckoutQuery(r: PackageCheckoutRequest): Record<string, string> {
  const query: Record<string, string> = {
    package: r.packageSlug,
    date: r.startDate,
    adults: String(r.adults),
    children: String(r.children),
  };
  if (r.departureId) query.departure = r.departureId;
  return query;
}

/** Reads the checkout URL back; the server action validates it again with packageCheckoutSchema. */
export function parsePackageCheckoutQuery(raw: RawParams): PackageCheckoutRequest {
  const int = (v: string, fallback: number) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const departure = first(raw.departure);
  return {
    packageSlug: first(raw.package),
    departureId: departure || undefined,
    startDate: first(raw.date),
    adults: int(first(raw.adults), 2),
    children: int(first(raw.children), 0),
  };
}

/** Group-size choices for the booking widget, within the package's and the site's limits. */
export function travellerLimits(
  pkg: { minPax: number; maxPax: number },
  siteMax: number,
): { min: number; max: number } {
  const max = Math.max(1, Math.min(pkg.maxPax, siteMax));
  return { min: Math.min(pkg.minPax, max), max };
}

/** Earliest start a private ("any date") tour accepts online. */
export function privateTourMinDate(today: IsoDate, bookUntilDays: number): IsoDate {
  return firstBookableDate(today, bookUntilDays);
}

/** `/travel?mode=train` deep links; anything else opens the first tab. */
export function parseTravelMode(value: string | string[] | undefined): TravelMode {
  const v = first(value);
  return (TRAVEL_MODES as readonly string[]).includes(v) ? (v as TravelMode) : TRAVEL_MODES[0];
}

/** Prefill for /travel from the home search card (`from`, `to`, `date`). */
export function travelPrefill(raw: RawParams): { from: string; to: string; departOn: string } {
  const date = first(raw.date);
  return {
    from: first(raw.from).slice(0, 80),
    to: first(raw.to).slice(0, 80),
    departOn: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
  };
}

const localized = z.object({ en: z.string(), hi: z.string().nullish() });

const packageSnapshotSchema = z.object({
  package: z.object({
    slug: z.string(),
    title: localized,
    days: z.number(),
    nights: z.number(),
    destinations: z.array(z.string()).default([]),
    startCity: z.string().nullish(),
    inclusions: z.array(localized).default([]),
    exclusions: z.array(localized).default([]),
    startDate: z.string(),
    endDate: z.string(),
    pickupPoint: z.string().nullish(),
  }),
  cancellationPolicy: localized.nullish(),
});
export type PackageSnapshot = z.output<typeof packageSnapshotSchema>;

/** A booking made on the package checkout (snapshot written by lib/packages/service). */
export function packageSnapshot(snapshot: unknown): PackageSnapshot | null {
  const parsed = packageSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

const quoteSnapshotSchema = z.object({
  quote: z.object({
    number: z.number(),
    title: z.string(),
    notes: z.string().nullish(),
    terms: z.string().nullish(),
  }),
  lead: z.object({ reference: z.string(), kind: z.string() }).partial().nullish(),
  trip: z
    .object({ label: z.string().default(""), route: z.string().default("") })
    .partial()
    .nullish(),
});
export type QuoteSnapshot = z.output<typeof quoteSnapshotSchema>;

/** A booking created from an agent's quote (flights, trains, buses, custom tours). */
export function quoteSnapshot(snapshot: unknown): QuoteSnapshot | null {
  const parsed = quoteSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

/** Which state the public quote page shows. */
export function quotePageState(status: string): "payable" | "paid" | "expired" | "cancelled" {
  if (status === "sent") return "payable";
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  return "cancelled";
}

/** What an enquiry form is about; the form itself (components/leads/enquiry-form) is shared. */
export type EnquiryTarget =
  | { kind: "package"; packageSlug: string }
  | { kind: "travel"; mode: TravelMode }
  | { kind: "service"; serviceSlug: string };

/** Every field any enquiry form shows, as typed (strings). */
export type EnquiryFormValues = {
  startDate: string;
  adults: string;
  children: string;
  from: string;
  to: string;
  departOn: string;
  returnOn: string;
  travelClass: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  website: string;
};

/** The submitEnquiry input for a target (validated again by enquirySchema on the server). */
export function enquiryPayload(
  target: EnquiryTarget,
  v: EnquiryFormValues,
  extra: { locale: "en" | "hi"; attribution: unknown },
): Record<string, unknown> {
  const contact = {
    name: v.name,
    phone: v.phone,
    email: v.email.trim(),
    message: v.message,
    website: v.website,
    attribution: extra.attribution,
    locale: extra.locale,
  };
  if (target.kind === "package") {
    return {
      kind: "package",
      packageSlug: target.packageSlug,
      startDate: v.startDate,
      adults: v.adults,
      children: v.children || "0",
      ...contact,
    };
  }
  if (target.kind === "travel") {
    return {
      kind: target.mode,
      from: v.from,
      to: v.to,
      departOn: v.departOn,
      returnOn: v.returnOn,
      adults: v.adults,
      children: v.children || "0",
      travelClass: v.travelClass,
      ...contact,
    };
  }
  return { kind: "service", serviceSlug: target.serviceSlug, ...contact };
}

/** Message key for a price line from lib/packages/pricing (null = show the stored description). */
export function packageLineLabel(key: string): "adult" | "child" | "supplement" | "fee" | null {
  if (key === "package:adult") return "adult";
  if (key === "package:child") return "child";
  if (key === "surcharge:departure") return "supplement";
  if (key === "fee:convenience") return "fee";
  return null;
}

const FATAL_CHECKOUT_ERRORS = new Set([
  "not_found",
  "booking_closed",
  "enquiry_only",
  "departure_required",
  "departure_closed",
  "sold_out",
  "too_many",
  "group_size",
  "no_tier",
  "package_unavailable",
  "closed",
]);

/** Errors that end this checkout (pick another date or enquire) vs. ones fixed in place (coupon, price, form). */
export function checkoutErrorKind(error: string): "fatal" | "retry" {
  return FATAL_CHECKOUT_ERRORS.has(error) ? "fatal" : "retry";
}

/** A calendar date (`YYYY-MM-DD`) as "12 Nov 2026" / "12 नव॰ 2026". */
export function formatTourDate(date: string | null | undefined, locale: string): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
