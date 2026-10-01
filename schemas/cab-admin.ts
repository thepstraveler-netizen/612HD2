import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";
import { rupeesToPaise } from "@/lib/money";
import { CAB_TRIP_TYPES } from "./cabs";

/**
 * Admin schemas for Phase 5 (cabs): catalog forms (places, categories and
 * models, fare rules, routes and their fares, local packages, add-ons,
 * peak pricing), fleet forms (drivers, vehicles, documents), dispatch
 * actions, the trips list filters and the Settings → Cabs form.
 *
 * Money is typed in rupees and leaves these schemas as integer paise;
 * percentages are typed as % and become basis points in the row mappers
 * (lib/cabs/admin-rows.ts). Messages are keys under `cms.errors`, except
 * cross-field issues on a `_form` path, which the cab forms show from
 * `cabsAdmin.errors`.
 */

export const CAB_PLACE_KINDS = ["city", "station", "airport", "temple", "landmark"] as const;
export const CAB_BODY_TYPES = [
  "hatchback",
  "sedan",
  "compact_suv",
  "suv",
  "muv",
  "tempo_traveller",
  "bus",
] as const;
export const FUEL_TYPES = ["petrol", "diesel", "cng", "electric"] as const;
export const TRIP_STATUSES = [
  "awaiting_payment",
  "unassigned",
  "assigned",
  "en_route",
  "arrived",
  "picked_up",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
/** Steps staff can move a trip to from the dispatch board (set_trip_status). */
export const TRIP_STEPS = ["en_route", "arrived", "picked_up", "completed", "no_show"] as const;
export type TripStep = (typeof TRIP_STEPS)[number];
/** Per-km fare rules exist for outstation trips only. */
export const FARE_RULE_TRIP_TYPES = ["one_way", "round_trip"] as const;
/** Routes carry every trip type except hourly local hire. */
export const ROUTE_TRIP_TYPES = CAB_TRIP_TYPES.filter((t) => t !== "local") as readonly Exclude<
  (typeof CAB_TRIP_TYPES)[number],
  "local"
>[];
export const FLEET_DOCUMENT_KINDS = [
  "licence",
  "rc",
  "insurance",
  "permit",
  "puc",
  "fitness",
  "id_proof",
  "other",
] as const;
export type FleetDocumentKind = (typeof FLEET_DOCUMENT_KINDS)[number];
export const FLEET_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const FLEET_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const uuid = z.uuid();
const optionalUuid = uuid.or(z.literal("")).transform((v) => v || null);
const key = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, { error: "invalidSlug" })
  .max(80);
const sortOrder = z.coerce.number().int().min(0).max(10_000);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const isoDate = z.string().refine(isIsoDate, { error: "invalid" });
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || isIsoDate(v), { error: "invalid" })
  .transform((v) => v || null);

/** Rupees typed in a form → paise. Empty → null. */
const rupees = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => v === "" || rupeesToPaise(v) !== null, { error: "invalidAmount" })
  .transform((v) => (v === "" ? null : rupeesToPaise(v)));
const rupeesOrZero = rupees.transform((v) => v ?? 0);
const requiredRupees = rupees.refine((v) => v !== null, { error: "required" }).transform((v) => v ?? 0);
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
/** A decimal typed as text ("27.565"), within [min, max]. */
const decimal = (min: number, max: number, message = "invalid") =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max, {
      error: message,
    })
    .transform(Number);
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^\+?[0-9]{10,15}$/.test(v), { error: "invalidPhone" });
const optionalPhone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => v === "" || /^\+?[0-9]{10,15}$/.test(v), { error: "invalidPhone" })
  .transform((v) => v || null);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "invalidTime" });
const tripTypes = z.array(z.enum(CAB_TRIP_TYPES)).max(CAB_TRIP_TYPES.length).default([]);
const categoryIds = z.array(uuid).max(50).default([]);
/** A percentage with up to two decimals ("12.5"). */
const percentText = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(/%$/, ""))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= max, { error: "invalid" })
    .transform(Number);

export const cabIdSchema = z.object({ id: uuid });

// ---------------------------------------------------------------- places

export const placeFormSchema = z.object({
  id: uuid.optional(),
  slug: key,
  name: localizedSchema,
  kind: z.enum(CAB_PLACE_KINDS),
  lat: decimal(-90, 90, "invalidCoordinate"),
  lng: decimal(-180, 180, "invalidCoordinate"),
  is_popular: z.boolean(),
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type PlaceFormInput = z.input<typeof placeFormSchema>;
export type PlaceForm = z.output<typeof placeFormSchema>;

// ---------------------------------------------------------------- categories and models

export const modelFormSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, { error: "required" }).max(80),
  fuel: z.enum(FUEL_TYPES),
  is_featured: z.boolean(),
  is_active: z.boolean(),
});

export const categoryFormSchema = z
  .object({
    id: uuid.optional(),
    key,
    name: localizedSchema,
    description: optionalLocalizedSchema,
    body_type: z.enum(CAB_BODY_TYPES),
    seats: int(1, 60),
    luggage: int(0, 40),
    is_ac: z.boolean(),
    image_id: optionalUuid,
    is_active: z.boolean(),
    sort_order: sortOrder,
    models: z.array(modelFormSchema).max(20).default([]),
  })
  .refine((v) => new Set(v.models.map((m) => m.name.toLowerCase())).size === v.models.length, {
    error: "duplicateModel",
    path: ["_form"],
  });
export type CategoryFormInput = z.input<typeof categoryFormSchema>;
export type CategoryForm = z.output<typeof categoryFormSchema>;

// ---------------------------------------------------------------- fare rules

/** One category × trip type cell of the fare grid. An empty rate means "not offered". */
export const fareRuleFormSchema = z.object({
  category_id: uuid,
  trip_type: z.enum(FARE_RULE_TRIP_TYPES),
  rate_per_km: rupees.refine((v) => v === null || v > 0, { error: "invalidAmount" }),
  min_km: int(0, 5000),
  min_km_per_day: int(0, 5000),
  driver_allowance: rupeesOrZero,
  night_charge: rupeesOrZero,
  extra_km: rupeesOrZero,
  tolls_included: z.boolean(),
  waiting_free_minutes: int(0, 24 * 60),
  waiting_per_hour: rupeesOrZero,
  is_active: z.boolean(),
});
export const fareRulesFormSchema = z.object({ rules: z.array(fareRuleFormSchema).max(200) });
export type FareRulesFormInput = z.input<typeof fareRulesFormSchema>;
export type FareRuleForm = z.output<typeof fareRuleFormSchema>;

// ---------------------------------------------------------------- routes

export const routeFormSchema = z
  .object({
    id: uuid.optional(),
    slug: key,
    trip_type: z.enum(ROUTE_TRIP_TYPES),
    from_place_id: uuid,
    to_place_id: uuid,
    name: optionalLocalizedSchema,
    description: optionalLocalizedSchema,
    stops: z
      .array(z.object({ name: z.string().trim().min(1, { error: "required" }).max(80) }))
      .max(30)
      .default([]),
    distance_km: decimal(0.1, 5000, "invalid").transform((v) => Math.round(v * 10) / 10),
    duration_minutes: int(1, 60 * 24 * 7),
    is_popular: z.boolean(),
    is_active: z.boolean(),
    sort_order: sortOrder,
  })
  // A sightseeing tour may start and end at the same place; a transfer or outstation route may not.
  .refine((v) => v.trip_type === "sightseeing" || v.from_place_id !== v.to_place_id, {
    error: "samePlace",
    path: ["_form"],
  });
export type RouteFormInput = z.input<typeof routeFormSchema>;
export type RouteForm = z.output<typeof routeFormSchema>;

/** Per-category fixed fares of one route; an empty fare means the category is not offered. */
export const routeFaresFormSchema = z.object({
  route_id: uuid,
  fares: z
    .array(
      z.object({
        category_id: uuid,
        fare: rupees.refine((v) => v === null || v > 0, { error: "invalidAmount" }),
        extra_km: rupeesOrZero,
        tolls_included: z.boolean(),
      }),
    )
    .max(50),
});
export type RouteFaresFormInput = z.input<typeof routeFaresFormSchema>;

// ---------------------------------------------------------------- local packages

export const packageFormSchema = z.object({
  id: uuid.optional(),
  key,
  name: localizedSchema,
  hours: int(1, 24),
  km: int(1, 1000),
  is_active: z.boolean(),
  sort_order: sortOrder,
  fares: z
    .array(
      z.object({
        category_id: uuid,
        fare: rupees.refine((v) => v === null || v > 0, { error: "invalidAmount" }),
        extra_km: rupeesOrZero,
        extra_hour: rupeesOrZero,
      }),
    )
    .max(50),
});
export type PackageFormInput = z.input<typeof packageFormSchema>;
export type PackageForm = z.output<typeof packageFormSchema>;

// ---------------------------------------------------------------- add-ons

export const addonFormSchema = z.object({
  id: uuid.optional(),
  key,
  name: localizedSchema,
  description: optionalLocalizedSchema,
  price: requiredRupees,
  trip_types: tripTypes,
  category_ids: categoryIds,
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type AddonFormInput = z.input<typeof addonFormSchema>;
export type AddonForm = z.output<typeof addonFormSchema>;

// ---------------------------------------------------------------- peak pricing

export const surchargeFormSchema = z
  .object({
    id: uuid.optional(),
    name: localizedSchema,
    /** "125" (%) = 1.25× the base fare; 100–300. */
    multiplier_percent: percentText(300).refine((v) => v >= 100, { error: "invalid" }),
    starts_on: optionalDate,
    ends_on: optionalDate,
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).default([]),
    trip_types: tripTypes,
    category_ids: categoryIds,
    is_active: z.boolean(),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, {
    error: "endBeforeStart",
    path: ["ends_on"],
  });
export type SurchargeFormInput = z.input<typeof surchargeFormSchema>;
export type SurchargeForm = z.output<typeof surchargeFormSchema>;

// ---------------------------------------------------------------- drivers and vehicles

export const driverFormSchema = z.object({
  id: uuid.optional(),
  full_name: z.string().trim().min(2, { error: "required" }).max(120),
  phone,
  alt_phone: optionalPhone,
  licence_no: text(40),
  licence_expiry: optionalDate,
  /** Comma-separated in the form ("Hindi, English"). */
  languages: z
    .string()
    .max(200)
    .transform((v) => [
      ...new Set(
        v
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().max(30)).max(10)),
  rating: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().min(1).max(5).nullable()),
  is_active: z.boolean(),
  notes: text(1000),
  /** Optional driver login: an existing account's email, resolved to its user id on the server. */
  login_email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, { error: "invalidEmail" })
    .transform((v) => v || null),
});
export type DriverFormInput = z.input<typeof driverFormSchema>;
export type DriverForm = z.output<typeof driverFormSchema>;

export const vehicleFormSchema = z.object({
  id: uuid.optional(),
  category_id: uuid,
  model_id: optionalUuid,
  registration_no: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, " "))
    .refine((v) => /^[A-Z0-9 -]{6,15}$/.test(v), { error: "invalid" }),
  colour: text(40),
  year: optionalInt(1990, 2100),
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
export type VehicleFormInput = z.input<typeof vehicleFormSchema>;
export type VehicleForm = z.output<typeof vehicleFormSchema>;

const fleetOwner = { owner_type: z.enum(["driver", "vehicle"]), owner_id: uuid };

/** Step 1 of a document upload: the server hands out a one-time signed upload URL. */
export const fleetUploadSchema = z.object({
  ...fleetOwner,
  mime_type: z.enum(FLEET_DOCUMENT_TYPES),
  size_bytes: z.number().int().positive().max(FLEET_DOCUMENT_MAX_BYTES),
});

/** Step 2: the uploaded file is recorded (the path must be one step 1 issued for this owner). */
export const fleetDocumentSchema = z.object({
  ...fleetOwner,
  kind: z.enum(FLEET_DOCUMENT_KINDS),
  file_path: z.string().regex(/^fleet\/(driver|vehicle)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/),
  expires_on: optionalDate,
});
export type FleetDocumentInput = z.input<typeof fleetDocumentSchema>;

// ---------------------------------------------------------------- dispatch

export const assignTripSchema = z.object({ tripId: uuid, driverId: uuid, vehicleId: uuid });
export type AssignTripInput = z.input<typeof assignTripSchema>;

export const tripStepSchema = z.object({
  tripId: uuid,
  status: z.enum(TRIP_STEPS),
  note: text(500).optional(),
});

export const tripIdSchema = z.object({ tripId: uuid });

/**
 * `/admin/cabs/trips?…` query string; `from`/`to` are pickup dates in
 * India. Invalid values are dropped one by one so a stale link still opens.
 */
export const tripFiltersSchema = z.object({
  status: z.enum(TRIP_STATUSES).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type TripFilters = z.output<typeof tripFiltersSchema>;

// ---------------------------------------------------------------- settings

/** Admin form for `cabs.defaults`; the stored value is re-checked with cabSettingsSchema. */
export const cabSettingsFormSchema = z.object({
  advance_percent: int(1, 100),
  min_advance: rupeesOrZero,
  gst_percent: percentText(28),
  sac: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, { error: "invalid" }),
  road_factor: decimal(1, 3),
  avg_speed_kmph: decimal(10, 120),
  min_lead_minutes: int(0, 7 * 24 * 60),
  max_advance_days: int(1, 365),
  max_trip_days: int(1, 60),
  night_start: hhmm,
  night_end: hhmm,
  require_pickup_otp: z.boolean(),
  hold_minutes: int(5, 120),
  cancellation_rules: z
    .array(
      z.object({
        hours_before: decimal(0, 24 * 365),
        refund_percent: int(0, 100),
      }),
    )
    .max(8),
});
export type CabSettingsFormInput = z.input<typeof cabSettingsFormSchema>;
export type CabSettingsForm = z.output<typeof cabSettingsFormSchema>;
