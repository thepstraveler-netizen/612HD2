import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";

/**
 * Hotel schemas: the public search query string, the stored JSON shapes
 * (policies, cancellation rules, settings) and the admin forms.
 */

export const PROPERTY_TYPES = [
  "hotel",
  "guest_house",
  "dharamshala",
  "ashram",
  "homestay",
  "resort",
  "apartment",
  "hostel",
] as const;
export const MEAL_PLANS = ["room_only", "breakfast", "half_board", "full_board"] as const;
export const HOTEL_SORTS = ["popular", "price_asc", "price_desc", "rating", "value"] as const;
export const ID_PROOFS = ["aadhaar", "passport", "driving_licence", "voter_id", "pan"] as const;
export const PUBLISH_STATUSES = ["draft", "published", "archived"] as const;

export type HotelSort = (typeof HOTEL_SORTS)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];

// ---------------------------------------------------------------- search query

const isoDate = z.string().refine(isIsoDate);
const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(item).max(20));
const flag = z.enum(["1", "true"]).transform(() => true);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/**
 * `/hotels?…` query string. Every field is optional and invalid values are
 * dropped one by one (`catch`), so a hand-edited or stale link still renders.
 */
export const hotelSearchSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  city: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
  checkin: isoDate.optional().catch(undefined),
  checkout: isoDate.optional().catch(undefined),
  rooms: int(1, 8).default(1).catch(1),
  adults: int(1, 30).default(2).catch(2),
  children: int(0, 20).default(0).catch(0),
  sort: z.enum(HOTEL_SORTS).default("popular").catch("popular"),
  /** Rupees per night. */
  price_min: int(0, 1_000_000).optional().catch(undefined),
  price_max: int(0, 1_000_000).optional().catch(undefined),
  stars: csv(int(0, 5)).optional().catch(undefined),
  rating: z.coerce.number().min(0).max(5).optional().catch(undefined),
  type: csv(z.enum(PROPERTY_TYPES)).optional().catch(undefined),
  amenities: csv(z.string().regex(/^[a-z0-9-]+$/))
    .optional()
    .catch(undefined),
  breakfast: flag.optional().catch(undefined),
  couple: flag.optional().catch(undefined),
  free_cancel: flag.optional().catch(undefined),
  landmark: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
  within: int(100, 50_000).optional().catch(undefined),
  page: int(1, 500).default(1).catch(1),
  view: z.enum(["list", "map"]).default("list").catch("list"),
});

export type HotelSearch = z.output<typeof hotelSearchSchema>;

/** Reads Next's `searchParams` (string | string[]) into a search. */
export function parseHotelSearch(raw: Record<string, string | string[] | undefined>): HotelSearch {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") flat[key] = v;
  }
  return hotelSearchSchema.parse(flat);
}

// ---------------------------------------------------------------- stored JSON

export const hotelPoliciesSchema = z.object({
  unmarried_couples_allowed: z.boolean().default(true),
  bachelors_allowed: z.boolean().default(true),
  local_ids_allowed: z.boolean().default(true),
  pets_allowed: z.boolean().default(false),
  id_proofs: z.array(z.enum(ID_PROOFS)).default(["aadhaar", "passport", "driving_licence", "voter_id"]),
  rules: z.array(localizedSchema).max(20).default([]),
});
export type HotelPolicies = z.output<typeof hotelPoliciesSchema>;

export const cancellationRulesSchema = z
  .array(
    z.object({
      hours_before: z
        .number()
        .int()
        .min(0)
        .max(24 * 365),
      refund_percent: z.number().int().min(0).max(100),
    }),
  )
  .max(6);

export const hotelSearchDefaultsSchema = z.object({
  city: z.string().default("vrindavan"),
  page_size: z.number().int().min(4).max(48).default(12),
  max_nights: z.number().int().min(1).max(90).default(30),
  max_rooms: z.number().int().min(1).max(20).default(8),
  price_buckets_paise: z
    .array(z.tuple([z.number().int().min(0), z.number().int().positive().nullable()]))
    .default([
      [0, 150_000],
      [150_000, 250_000],
      [250_000, 500_000],
      [500_000, null],
    ]),
  landmark_radii_m: z.array(z.number().int().positive()).default([500, 1000, 2000, 5000]),
  /** Map view tiles; any XYZ tile server. Attribution is required by most providers. */
  map_tiles: z.object({ url: z.string().startsWith("https://"), attribution: z.string() }).default({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  }),
});
export type HotelSearchDefaults = z.output<typeof hotelSearchDefaultsSchema>;

// ---------------------------------------------------------------- admin forms

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, { error: "invalidSlug" })
  .max(80);
const uuid = z.uuid();
const optionalUuid = uuid.or(z.literal("")).transform((v) => v || null);
const sortOrder = z.coerce.number().int().min(0).max(10_000);
/** Rupees typed in a form → paise. Empty → null. */
const rupees = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,\s₹]/g, ""))
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), { error: "invalidAmount" })
  .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));
const requiredRupees = rupees.refine((v) => v !== null, { error: "required" }).transform((v) => v ?? 0);
const coord = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), {
      error: "invalidCoordinate",
    })
    .transform((v) => (v === "" ? null : Number(v)));
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, { error: "invalidTime" });

export const hotelFormSchema = z.object({
  id: uuid.optional(),
  slug,
  name: localizedSchema,
  summary: optionalLocalizedSchema,
  description: optionalLocalizedSchema,
  property_type: z.enum(PROPERTY_TYPES),
  star_rating: z.coerce.number().int().min(0).max(5),
  city_id: uuid,
  area_id: optionalUuid,
  vendor_id: optionalUuid,
  address: z.string().trim().max(300),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  check_in_time: time,
  check_out_time: time,
  highlights: z.array(localizedSchema).max(12).default([]),
  food_dining: optionalLocalizedSchema,
  policies: hotelPoliciesSchema,
  amenity_ids: z.array(uuid).max(60).default([]),
  is_couple_friendly: z.boolean(),
  is_featured: z.boolean(),
  is_sponsored: z.boolean(),
  pay_at_hotel_enabled: z.boolean(),
  part_payment_percent: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(99).nullable()),
  early_checkin: rupees,
  late_checkout: rupees,
  breakfast_addon: rupees,
  commission_percent: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().min(0).max(100).nullable()),
  rating_avg: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().min(0).max(5).nullable()),
  rating_count: z.coerce.number().int().min(0),
  status: z.enum(PUBLISH_STATUSES),
  seo_title: z.string().trim().max(70),
  seo_description: z.string().trim().max(170),
  sort_order: sortOrder,
});
export type HotelFormInput = z.input<typeof hotelFormSchema>;

export const ratePlanFormSchema = z.object({
  id: uuid.optional(),
  name: localizedSchema,
  meal_plan: z.enum(MEAL_PLANS),
  inclusions: z.array(localizedSchema).max(10).default([]),
  is_refundable: z.boolean(),
  /** Hours before check-in until which cancellation is free; empty = no free cancellation. */
  free_cancel_hours: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(
      z
        .number()
        .int()
        .min(0)
        .max(24 * 60)
        .nullable(),
    ),
  base_price: requiredRupees,
  extra_adult: rupees.transform((v) => v ?? 0),
  extra_child: rupees.transform((v) => v ?? 0),
  min_stay: z.coerce.number().int().min(1).max(30),
  max_stay: z
    .union([z.string(), z.number()])
    .transform((v) => (String(v).trim() === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(90).nullable()),
  is_active: z.boolean(),
});

export const roomFormSchema = z
  .object({
    id: uuid.optional(),
    hotel_id: uuid,
    name: localizedSchema,
    description: optionalLocalizedSchema,
    bed_type: z.string().trim().max(60),
    size_sqft: z
      .union([z.string(), z.number()])
      .transform((v) => (String(v).trim() === "" ? null : Number(v)))
      .pipe(z.number().int().positive().max(100_000).nullable()),
    base_occupancy: z.coerce.number().int().min(1).max(20),
    max_adults: z.coerce.number().int().min(1).max(20),
    max_children: z.coerce.number().int().min(0).max(20),
    max_occupancy: z.coerce.number().int().min(1).max(30),
    total_units: z.coerce.number().int().min(0).max(500),
    amenity_ids: z.array(uuid).max(60).default([]),
    sort_order: sortOrder,
    is_active: z.boolean(),
    plans: z.array(ratePlanFormSchema).min(1, { error: "needPlan" }).max(8),
  })
  .refine((v) => v.base_occupancy <= v.max_adults && v.max_adults <= v.max_occupancy, {
    error: "occupancyOrder",
    path: ["max_occupancy"],
  });
export type RoomFormInput = z.input<typeof roomFormSchema>;

/** Bulk calendar edit: one room, a date range, optional weekdays, and what to change. */
export const calendarEditSchema = z
  .object({
    hotel_id: uuid,
    room_id: uuid,
    start: isoDate,
    end: isoDate,
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).default([]),
    /** "keep" leaves inventory untouched. */
    availability: z.enum(["keep", "open", "close"]),
    units: z
      .union([z.string(), z.number()])
      .transform((v) => (String(v).trim() === "" ? null : Number(v)))
      .pipe(z.number().int().min(0).max(500).nullable()),
    min_stay: z
      .union([z.string(), z.number()])
      .transform((v) => (String(v).trim() === "" ? null : Number(v)))
      .pipe(z.number().int().min(1).max(30).nullable()),
    rate_plan_id: optionalUuid,
    price: rupees,
    clear_price: z.boolean().default(false),
  })
  .refine((v) => v.end >= v.start, { error: "endBeforeStart", path: ["end"] })
  .refine((v) => (Date.parse(v.end) - Date.parse(v.start)) / 86_400_000 <= 366, {
    error: "rangeTooLong",
    path: ["end"],
  })
  .refine((v) => v.price === null || v.rate_plan_id !== null, { error: "pickPlan", path: ["rate_plan_id"] });
export type CalendarEditInput = z.input<typeof calendarEditSchema>;

export const pricingRuleFormSchema = z
  .object({
    id: uuid.optional(),
    hotel_id: uuid,
    room_id: optionalUuid,
    rate_plan_id: optionalUuid,
    name: z.string().trim().min(2, { error: "required" }).max(80),
    start_date: isoDate,
    end_date: isoDate,
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).default([]),
    adjustment: z.enum(["percent", "flat", "fixed"]),
    /** percent: e.g. "25" or "-10"; flat/fixed: rupees. */
    amount: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), { error: "invalidAmount" })
      .transform(Number),
    priority: z.coerce.number().int().min(0).max(100),
    is_active: z.boolean(),
  })
  .refine((v) => v.end_date >= v.start_date, { error: "endBeforeStart", path: ["end_date"] })
  .refine((v) => v.adjustment !== "fixed" || v.amount >= 0, { error: "invalidAmount", path: ["amount"] });
export type PricingRuleFormInput = z.input<typeof pricingRuleFormSchema>;

export const hotelMediaSchema = z.object({
  hotel_id: uuid,
  media_ids: z.array(uuid).max(60),
});

export const hotelDeleteSchema = z.object({ id: uuid });
