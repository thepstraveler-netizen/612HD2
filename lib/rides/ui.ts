import { z } from "zod";
import type { RideSearch, RideSettings } from "@/schemas/rides";
import type { Enums } from "@/types/database";

/**
 * Pure helpers for the customer and driver ride screens: URL state, the
 * landmark picker groups, message values, fare line labels, how a ride
 * status is shown and the booking snapshot. No prices are computed here.
 */

export type RideStatus = Enums<"ride_status">;
export type Tone = "success" | "warning" | "danger" | "info" | "muted";
export type RidePointKind = "temple" | "ghat" | "station" | "market" | "hotel" | "landmark";

/** "here" with coordinates rounded to ~1 m: enough for a pickup, short in the URL. */
export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/** The URL query for a ride search, keeping only the keys its mode uses. */
export function rideSearchQuery(search: Partial<RideSearch>): Record<string, string> {
  const out: Record<string, string> = {};
  const mode = search.mode ?? "point_to_point";
  if (search.v) out.v = search.v;
  out.mode = mode;
  if (search.from) {
    out.from = search.from;
    if (search.from === "here" && search.flat !== undefined && search.flng !== undefined) {
      out.flat = String(roundCoord(search.flat));
      out.flng = String(roundCoord(search.flng));
    }
  }
  if (mode === "point_to_point") {
    if (search.to) {
      out.to = search.to;
      if (search.to === "here" && search.tlat !== undefined && search.tlng !== undefined) {
        out.tlat = String(roundCoord(search.tlat));
        out.tlng = String(roundCoord(search.tlng));
      }
    }
  } else {
    out.hrs = String(search.hrs ?? 2);
  }
  out.at = search.at ?? "now";
  out.pax = String(search.pax ?? 1);
  return out;
}

/** A search counts as submitted once it names a pickup (the form always writes one). */
export function rideSearchSubmitted(raw: Record<string, string | string[] | undefined>): boolean {
  const from = Array.isArray(raw.from) ? raw.from[0] : raw.from;
  return typeof from === "string" && from !== "";
}

/** Values for the `rides.errors.*` messages. */
export function ridePlanErrorValues(settings: RideSettings): Record<string, number> {
  return {
    minutes: settings.min_lead_minutes,
    days: settings.max_advance_days,
    km: settings.max_ride_km,
    hours: settings.max_hours,
  };
}

export type RidePointOption = {
  slug: string;
  name: string;
  kind: RidePointKind;
  isPopular: boolean;
  zone: string;
};
export type RideZoneOption = { slug: string; name: string };
export type RidePointGroup = { key: string; label: string | null; points: RidePointOption[] };

const normalize = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Picker groups: popular landmarks first (label null → "Popular"), then
 * every zone in catalog order with its remaining landmarks. A search term
 * matches the name, slug or zone name and drops the popular group.
 */
export function groupRidePoints(
  points: readonly RidePointOption[],
  zones: readonly RideZoneOption[],
  term = "",
): RidePointGroup[] {
  const q = normalize(term.trim());
  const zoneName = new Map(zones.map((z) => [z.slug, z.name]));
  const matching = q
    ? points.filter(
        (p) =>
          normalize(p.name).includes(q) ||
          p.slug.includes(q.replace(/\s+/g, "-")) ||
          normalize(zoneName.get(p.zone) ?? "").includes(q),
      )
    : points;
  const groups: RidePointGroup[] = [];
  if (!q) {
    const popular = matching.filter((p) => p.isPopular);
    if (popular.length) groups.push({ key: "popular", label: null, points: popular });
  }
  for (const zone of zones) {
    const list = matching.filter((p) => p.zone === zone.slug && (q ? true : !p.isPopular));
    if (list.length) groups.push({ key: zone.slug, label: zone.name, points: list });
  }
  return groups;
}

export function hourOptions(maxHours: number): number[] {
  return Array.from({ length: Math.max(1, Math.floor(maxHours)) }, (_, i) => i + 1);
}

/** Browser geolocation failure → message key under `rides.search.geo`. */
export type GeoProblem = "denied" | "unavailable" | "timeout" | "unsupported";

export function geoProblem(code: number | "unsupported"): GeoProblem {
  if (code === "unsupported") return "unsupported";
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/** Fare breakup line → message key under `rides.lines`. */
export function rideLineKey(key: string): "fare" | "night" | "fee" | "other" {
  if (key === "fare") return "fare";
  if (key === "surcharge:night") return "night";
  if (key.startsWith("fee:")) return "fee";
  return "other";
}

export function rideStatusTone(status: RideStatus): Tone {
  switch (status) {
    case "awaiting_payment":
    case "requested":
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

const BEFORE_PICKUP: readonly RideStatus[] = ["requested", "assigned", "en_route", "arrived"];

/** The pickup OTP is shown once the ride is confirmed and until the rider is picked up. */
export function showRideOtp(
  bookingStatus: string,
  rideStatus: RideStatus | null,
  otp: string | null,
): boolean {
  return (
    Boolean(otp) && bookingStatus === "confirmed" && rideStatus !== null && BEFORE_PICKUP.includes(rideStatus)
  );
}

/** Customers may cancel online until the driver has set off. */
export function rideAllowsCancel(rideStatus: RideStatus | null): boolean {
  return (
    rideStatus === null ||
    rideStatus === "awaiting_payment" ||
    rideStatus === "requested" ||
    rideStatus === "assigned"
  );
}

/** The rating form shows once a completed ride has no rating yet. */
export function canRateRide(rideStatus: RideStatus | null, ratedAt: string | null): boolean {
  return rideStatus === "completed" && !ratedAt;
}

export type RideDriverAction = { status: RideStatus; primary: boolean; needsOtp: boolean };

/** The driver's buttons for the next steps (from RIDE_DRIVER_NEXT), primary first. */
export function rideDriverActions(next: readonly RideStatus[], requireOtp: boolean): RideDriverAction[] {
  return next.map((status) => ({
    status,
    primary: status !== "no_show",
    needsOtp: status === "picked_up" && requireOtp,
  }));
}

const localized = z.object({ en: z.string(), hi: z.string().nullish() });
const place = z.object({ slug: z.string().nullable(), name: localized });

/** The ride part of a booking snapshot (written by lib/rides/service), read leniently. */
const rideSnapshotSchema = z.object({
  ride: z.object({
    mode: z.enum(["point_to_point", "hourly"]),
    label: z.string().default(""),
    vehicleType: z.object({ key: z.string(), name: localized, icon: z.string().default("bike") }),
    zone: z.object({ slug: z.string(), name: localized }).nullish(),
    from: place,
    to: place.nullish(),
    hours: z.number().nullish(),
    pickupAt: z.string(),
    isNow: z.boolean().default(false),
    distanceKm: z.number().nullish(),
    durationMinutes: z.number().nullish(),
    instantBook: z.boolean().default(true),
  }),
  terms: z
    .object({
      includedKm: z.number(),
      hours: z.number().nullable(),
      extraKmPaise: z.number(),
      freeWaitingMinutes: z.number(),
      perMinWaitingPaise: z.number(),
      night: z.boolean(),
    })
    .partial()
    .nullish(),
  cancellationRules: z.array(z.object({ hours_before: z.number(), refund_percent: z.number() })).default([]),
});
export type RideSnapshot = z.output<typeof rideSnapshotSchema>;

export function rideSnapshot(snapshot: unknown): RideSnapshot | null {
  const parsed = rideSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}
