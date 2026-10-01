import { z } from "zod";
import { phoneSchema, PAYMENT_MODES } from "./booking";

/**
 * Cab settings, search and checkout schemas. Search state lives in the URL
 * and the review page posts the checkout to a server action; both are
 * parsed again on the server, and prices are never part of the input.
 */

export const CAB_TRIP_TYPES = ["one_way", "round_trip", "local", "transfer", "sightseeing"] as const;
export type CabTripType = (typeof CAB_TRIP_TYPES)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** `settings` key `cabs.defaults` (admin → Settings → Cabs). */
export const cabSettingsSchema = z.object({
  advance_percent: z.number().int().min(1).max(100).default(20),
  min_advance_paise: z.number().int().min(0).default(50_000),
  tax_bps: z.number().int().min(0).max(2800).default(500),
  sac: z
    .string()
    .regex(/^\d{4,8}$/)
    .default("996601"),
  /** Straight-line distance × this ≈ road distance, when no route row exists. */
  road_factor: z.number().min(1).max(3).default(1.25),
  avg_speed_kmph: z.number().min(10).max(120).default(45),
  min_lead_minutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .default(120),
  max_advance_days: z.number().int().min(1).max(365).default(90),
  max_trip_days: z.number().int().min(1).max(60).default(15),
  night_start: hhmm.default("22:00"),
  night_end: hhmm.default("06:00"),
  require_pickup_otp: z.boolean().default(true),
  hold_minutes: z.number().int().min(5).max(120).default(15),
  cancellation_rules: z
    .array(z.object({ hours_before: z.number().min(0), refund_percent: z.number().min(0).max(100) }))
    .default([
      { hours_before: 24, refund_percent: 100 },
      { hours_before: 6, refund_percent: 50 },
      { hours_before: 0, refund_percent: 0 },
    ]),
});
export type CabSettings = z.output<typeof cabSettingsSchema>;
export type CabSettingsInput = z.input<typeof cabSettingsSchema>;

const slug = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(80);
/** Pickup moment as typed in a datetime-local input, read as India time. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

/**
 * What the search form puts in the URL:
 *   one_way / round_trip: from, to, at (+ back for round trips)
 *   transfer:             from, to, at (one end is a station or airport)
 *   local:                from, at, pkg
 *   sightseeing:          route (a tour), at
 */
export const cabSearchSchema = z.object({
  type: z.enum(CAB_TRIP_TYPES).default("one_way"),
  from: slug.optional(),
  to: slug.optional(),
  route: slug.optional(),
  pkg: slug.optional(),
  at: localDateTime.optional(),
  back: localDateTime.optional(),
  pax: z.coerce.number().int().min(1).max(50).default(2),
});
export type CabSearch = z.output<typeof cabSearchSchema>;

/** Lenient parse of URL params: bad values fall back to defaults instead of failing. */
export function parseCabSearch(params: Record<string, string | string[] | undefined>): CabSearch {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") flat[k] = value;
  }
  const out: Record<string, unknown> = {};
  const shape = cabSearchSchema.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (flat[key] === undefined) continue;
    const parsed = shape[key].safeParse(flat[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return cabSearchSchema.parse(out);
}

export const CAB_PAYMENT_MODES = PAYMENT_MODES.filter((m) => m !== "pay_at_hotel") as readonly (
  "full" | "part"
)[];

/** Review page → server: the search, the chosen category and how to pay. */
export const cabCheckoutSchema = cabSearchSchema.extend({
  category: slug,
  addons: z.array(slug).max(10).default([]),
  coupon: z.string().trim().max(24).optional(),
  paymentMode: z.enum(["full", "part"]).default("part"),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type CabCheckout = z.output<typeof cabCheckoutSchema>;
export type CabCheckoutInput = z.input<typeof cabCheckoutSchema>;

export const cabPassengerSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(120),
  email: z.email({ error: "invalidEmail" }).max(200),
  phone: phoneSchema,
  pickupAddress: z.string().trim().min(3, { error: "required" }).max(300),
  dropAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CabPassenger = z.output<typeof cabPassengerSchema>;
export type CabPassengerInput = z.input<typeof cabPassengerSchema>;

/** Driver page: one status step, with the customer's OTP at pickup. */
export const driverStepSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  status: z.enum(["en_route", "arrived", "picked_up", "completed", "no_show"]),
  otp: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
export type DriverStep = z.output<typeof driverStepSchema>;
