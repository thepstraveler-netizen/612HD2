import { z } from "zod";
import { phoneSchema } from "./booking";

/**
 * Local ride settings, search and checkout schemas. The search lives in the
 * URL and the review page posts the checkout to a server action; both are
 * parsed again on the server, and prices are never part of the input.
 */

export const RIDE_MODES = ["point_to_point", "hourly"] as const;
export type RideMode = (typeof RIDE_MODES)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** `settings` key `rides.defaults` (admin → Settings → Rides). */
export const rideSettingsSchema = z.object({
  /** Straight-line distance × this ≈ road distance inside town. */
  road_factor: z.number().min(1).max(3).default(1.3),
  avg_speed_kmph: z.number().min(5).max(80).default(18),
  /** Longer trips belong to cabs. */
  max_ride_km: z.number().min(1).max(200).default(40),
  /** "Ride now" picks up this many minutes from now; later rides must be at least this far ahead. */
  min_lead_minutes: z.number().int().min(0).max(240).default(10),
  max_advance_days: z.number().int().min(1).max(60).default(7),
  max_hours: z.number().int().min(1).max(24).default(12),
  night_start: hhmm.default("22:00"),
  night_end: hhmm.default("06:00"),
  require_pickup_otp: z.boolean().default(true),
  /** Lets customers pay the driver instead of paying online. */
  pay_later_enabled: z.boolean().default(true),
  hold_minutes: z.number().int().min(5).max(60).default(10),
  sac: z
    .string()
    .regex(/^\d{4,8}$/)
    .default("996601"),
  cancellation_rules: z
    .array(z.object({ hours_before: z.number().min(0), refund_percent: z.number().min(0).max(100) }))
    .default([
      { hours_before: 1, refund_percent: 100 },
      { hours_before: 0, refund_percent: 50 },
    ]),
});
export type RideSettings = z.output<typeof rideSettingsSchema>;
export type RideSettingsInput = z.input<typeof rideSettingsSchema>;

const slug = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(80);
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
/** Pickup moment as typed in a datetime-local input, read as India time. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

/**
 * What the ride form puts in the URL:
 *   v      vehicle type key (bike, e-rickshaw, rickshaw, car)
 *   mode   point_to_point (from → to) or hourly (from + hrs)
 *   from / to   a landmark slug, or "here" with lat/lng from the browser
 *   at     "now" or a local date-time
 */
export const rideSearchSchema = z.object({
  v: slug.optional(),
  mode: z.enum(RIDE_MODES).default("point_to_point"),
  from: slug.optional(),
  flat: lat.optional(),
  flng: lng.optional(),
  to: slug.optional(),
  tlat: lat.optional(),
  tlng: lng.optional(),
  hrs: z.coerce.number().int().min(1).max(24).default(2),
  at: z.union([z.literal("now"), localDateTime]).default("now"),
  pax: z.coerce.number().int().min(1).max(12).default(1),
});
export type RideSearch = z.output<typeof rideSearchSchema>;
export type RideSearchInput = z.input<typeof rideSearchSchema>;

/** Lenient parse of URL params: bad values fall back to defaults instead of failing. */
export function parseRideSearch(params: Record<string, string | string[] | undefined>): RideSearch {
  const out: Record<string, unknown> = {};
  const shape = rideSearchSchema.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;
    const parsed = shape[key].safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return rideSearchSchema.parse(out);
}

/** online = pay the whole fare now; driver = pay the driver at the end (bookings.payment_mode pay_at_hotel). */
export const RIDE_PAYMENT_MODES = ["online", "driver"] as const;
export type RidePaymentMode = (typeof RIDE_PAYMENT_MODES)[number];

/** Review page → server: the search, the vehicle and how to pay. */
export const rideCheckoutSchema = rideSearchSchema.extend({
  v: slug,
  coupon: z.string().trim().max(24).optional(),
  pay: z.enum(RIDE_PAYMENT_MODES).default("driver"),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type RideCheckout = z.output<typeof rideCheckoutSchema>;
export type RideCheckoutInput = z.input<typeof rideCheckoutSchema>;

export const ridePassengerSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  email: z.union([z.literal(""), z.email({ error: "invalidEmail" }).max(200)]).optional(),
  /** Gate, lane or landmark detail for the driver. */
  pickupAddress: z.string().trim().min(3, { error: "required" }).max(300),
  dropAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type RidePassenger = z.output<typeof ridePassengerSchema>;
export type RidePassengerInput = z.input<typeof ridePassengerSchema>;

export const rateRideSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6,20}$/),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).default(""),
});
export type RateRide = z.output<typeof rateRideSchema>;

/** Driver page: one status step, with the customer's OTP at pickup. */
export const rideDriverStepSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  status: z.enum(["en_route", "arrived", "picked_up", "completed", "no_show"]),
  otp: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
export type RideDriverStep = z.output<typeof rideDriverStepSchema>;
