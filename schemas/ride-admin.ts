import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";
import { rupeesToPaise } from "@/lib/money";
import { FUEL_TYPES } from "./cab-admin";
import { RIDE_MODES } from "./rides";

/**
 * Admin schemas for Phase 6 (local rides): vehicle types, zones, landmarks,
 * the per-zone fare grid, ride vehicles, dispatch actions, the live board
 * filters and the Settings → Rides form.
 *
 * Money is typed in rupees and leaves these schemas as integer paise;
 * percentages are typed as % and become basis points in the row mappers
 * (lib/rides/admin-rows.ts). Messages are keys under `cms.errors`, or under
 * `admin.rides.errors` for cross-field issues on a `_form` path.
 */

export const RIDE_POINT_KINDS = ["temple", "ghat", "station", "market", "hotel", "landmark"] as const;
export const RIDE_STATUSES = [
  "awaiting_payment",
  "requested",
  "assigned",
  "en_route",
  "arrived",
  "picked_up",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];
/** Steps staff can move a ride to (set_ride_status, source admin: no OTP). */
export const RIDE_STEPS = ["en_route", "arrived", "picked_up", "completed", "no_show"] as const;
export type RideStep = (typeof RIDE_STEPS)[number];
export { FUEL_TYPES, RIDE_MODES };

const uuid = z.uuid();
const optionalUuid = uuid.or(z.literal("")).transform((v) => v || null);
const key = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, { error: "invalidSlug" })
  .max(80);
const sortOrder = z.coerce.number().int().min(0).max(10_000);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || isIsoDate(v), { error: "invalid" })
  .transform((v) => v || null);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "invalidTime" });

/** Rupees typed in a form → paise. Empty → null. */
export const rupeesField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => v === "" || rupeesToPaise(v) !== null, { error: "invalidAmount" })
  .transform((v) => (v === "" ? null : rupeesToPaise(v)));
const rupeesOrZero = rupeesField.transform((v) => v ?? 0);

/** A decimal typed as text ("27.565"), within [min, max]. */
const decimal = (min: number, max: number, message = "invalid") =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max, {
      error: message,
    })
    .transform(Number);

/** A percentage with up to two decimals ("12.5"), 0–max. */
export const percentField = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(/%$/, ""))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= max, { error: "invalid" })
    .transform(Number);

export const rideIdSchema = z.object({ id: uuid });

// ---------------------------------------------------------------- vehicle types

export const vehicleTypeFormSchema = z.object({
  id: uuid.optional(),
  key,
  service_slug: key,
  name: localizedSchema,
  description: optionalLocalizedSchema,
  icon: key,
  seats: int(1, 12),
  instant_book: z.boolean(),
  /** GST on the fare in % ("5"); stored as basis points (max 28%). */
  gst_percent: percentField(28),
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type VehicleTypeFormInput = z.input<typeof vehicleTypeFormSchema>;
export type VehicleTypeForm = z.output<typeof vehicleTypeFormSchema>;

// ---------------------------------------------------------------- zones and landmarks

export const zoneFormSchema = z.object({
  id: uuid.optional(),
  slug: key,
  name: localizedSchema,
  lat: decimal(-90, 90, "invalidCoordinate"),
  lng: decimal(-180, 180, "invalidCoordinate"),
  radius_km: decimal(0.1, 100).transform((v) => Math.round(v * 10) / 10),
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type ZoneFormInput = z.input<typeof zoneFormSchema>;
export type ZoneForm = z.output<typeof zoneFormSchema>;

export const pointFormSchema = z.object({
  id: uuid.optional(),
  zone_id: uuid,
  slug: key,
  name: localizedSchema,
  kind: z.enum(RIDE_POINT_KINDS),
  lat: decimal(-90, 90, "invalidCoordinate"),
  lng: decimal(-180, 180, "invalidCoordinate"),
  is_popular: z.boolean(),
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type PointFormInput = z.input<typeof pointFormSchema>;
export type PointForm = z.output<typeof pointFormSchema>;

// ---------------------------------------------------------------- fare grid

/**
 * One vehicle type × mode cell of a zone's fare grid. A point-to-point cell
 * is offered when base, per km or minimum fare is filled; an hourly cell
 * when the hourly rate is. A cell left empty is not offered (removed on save).
 */
export const rideFareCellSchema = z
  .object({
    vehicle_type_id: uuid,
    mode: z.enum(RIDE_MODES),
    base: rupeesField,
    included_km: decimal(0, 999.9).transform((v) => Math.round(v * 10) / 10),
    per_km: rupeesField,
    min_fare: rupeesField,
    hourly: rupeesField,
    min_hours: int(1, 24),
    km_per_hour: int(0, 1000),
    free_waiting_minutes: int(0, 600),
    per_min_waiting: rupeesOrZero,
    /** Night surcharge in % (+0 to +100); stored as night_bps 10000–20000. */
    night_percent: percentField(100),
    is_active: z.boolean(),
  })
  .superRefine((cell, ctx) => {
    if (cell.mode === "hourly") {
      if (cell.hourly !== null && cell.hourly <= 0) {
        ctx.addIssue({ code: "custom", message: "invalidAmount", path: ["hourly"] });
      }
      return;
    }
    const filled = [cell.base, cell.per_km, cell.min_fare].filter((v) => v !== null);
    if (filled.length > 0 && !filled.some((v) => (v ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", message: "invalidAmount", path: ["base"] });
    }
  });
export type RideFareCellInput = z.input<typeof rideFareCellSchema>;
export type RideFareCell = z.output<typeof rideFareCellSchema>;

export const rideFaresFormSchema = z.object({
  zone_id: uuid,
  rules: z.array(rideFareCellSchema).max(100),
});
export type RideFaresFormInput = z.input<typeof rideFaresFormSchema>;
export type RideFaresForm = z.output<typeof rideFaresFormSchema>;

// ---------------------------------------------------------------- ride vehicles

export const rideVehicleFormSchema = z.object({
  id: uuid.optional(),
  ride_vehicle_type_id: uuid,
  /** Optional: a cycle rickshaw may have no registration. */
  registration_no: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, " "))
    .refine((v) => v === "" || /^[A-Z0-9 -]{4,15}$/.test(v), { error: "invalid" })
    .transform((v) => v || null),
  colour: text(40),
  fuel: z.enum(FUEL_TYPES),
  default_driver_id: optionalUuid,
  rc_expiry: optionalDate,
  insurance_expiry: optionalDate,
  permit_expiry: optionalDate,
  puc_expiry: optionalDate,
  fitness_expiry: optionalDate,
  is_active: z.boolean(),
  notes: text(1000),
});
export type RideVehicleFormInput = z.input<typeof rideVehicleFormSchema>;
export type RideVehicleForm = z.output<typeof rideVehicleFormSchema>;

// ---------------------------------------------------------------- dispatch

export const assignRideSchema = z.object({
  rideId: uuid,
  driverId: uuid,
  /** Optional: a ride vehicle of any type. */
  vehicleId: optionalUuid.optional().transform((v) => v ?? null),
});
export type AssignRideInput = z.input<typeof assignRideSchema>;

export const rideStepSchema = z.object({
  rideId: uuid,
  status: z.enum(RIDE_STEPS),
  note: text(500).optional(),
});

export const rideRefSchema = z.object({ rideId: uuid });

/** Board groups a status filter can name, besides a single status. */
export const RIDE_BOARD_GROUPS = ["requested", "active", "finished"] as const;
export type RideBoardGroup = (typeof RIDE_BOARD_GROUPS)[number];

/**
 * `/admin/rides?…`: `status` is a board group or one status, `date` a pickup
 * date in India. Invalid values are dropped one by one so a stale link opens.
 */
export const rideBoardFiltersSchema = z.object({
  status: z
    .union([z.enum(RIDE_BOARD_GROUPS), z.enum(RIDE_STATUSES)])
    .optional()
    .catch(undefined),
  date: z.string().refine(isIsoDate).optional().catch(undefined),
});
export type RideBoardFilters = z.output<typeof rideBoardFiltersSchema>;

// ---------------------------------------------------------------- settings

/** Admin form for `rides.defaults`; the stored value is re-checked with rideSettingsSchema. */
export const rideSettingsFormSchema = z.object({
  road_factor: decimal(1, 3),
  avg_speed_kmph: decimal(5, 80),
  max_ride_km: decimal(1, 200),
  min_lead_minutes: int(0, 240),
  max_advance_days: int(1, 60),
  max_hours: int(1, 24),
  night_start: hhmm,
  night_end: hhmm,
  require_pickup_otp: z.boolean(),
  pay_later_enabled: z.boolean(),
  hold_minutes: int(5, 60),
  sac: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, { error: "invalid" }),
  cancellation_rules: z
    .array(
      z.object({
        hours_before: decimal(0, 24 * 60),
        refund_percent: int(0, 100),
      }),
    )
    .max(8),
});
export type RideSettingsFormInput = z.input<typeof rideSettingsFormSchema>;
export type RideSettingsForm = z.output<typeof rideSettingsFormSchema>;
