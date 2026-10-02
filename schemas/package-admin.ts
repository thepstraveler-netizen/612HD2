import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";
import type { LeadsSettings } from "./leads";
import { MEALS, PACKAGE_BOOKING_MODES } from "./packages";
import { percentField, rupeesField } from "./ride-admin";

/**
 * Admin schemas for Phase 8 tour packages: the package form, its itinerary
 * days, pricing tiers and departures, the list filters and the Settings →
 * Packages & leads forms (`packages.defaults`, `leads.defaults`,
 * `travel.defaults`).
 *
 * Money is typed in rupees and leaves these schemas as integer paise; GST
 * and the advance are typed as % (GST becomes basis points in the row
 * mappers, lib/packages/admin-rows.ts). Field messages are keys under
 * `cms.errors` so the shared form fields translate them; cross-field and
 * catalog-wide problems (tier overlaps, …) use keys under
 * `packagesAdmin.errors` on a `_form` path.
 */

export { MEALS, PACKAGE_BOOKING_MODES };

/** List filter: live = active, hidden = switched off, archived = soft-deleted. */
export const PACKAGE_STATUSES = ["live", "hidden", "archived"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** `leads.defaults.auto_assign` choices (mirrors leadsSettingsSchema). */
export const LEAD_AUTO_ASSIGN = [
  "least_loaded",
  "none",
] as const satisfies readonly LeadsSettings["auto_assign"][];

const uuid = z.uuid();
const optionalUuid = uuid.or(z.literal("")).transform((v) => v || null);
const slug = z
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
const sac = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, { error: "invalid" });
const isoDate = z
  .string()
  .trim()
  .refine((v) => isIsoDate(v), { error: "invalid" });

/** Empty → null; otherwise a whole number in [min, max]. */
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" && Number.isNaN(v) ? "" : String(v).trim()))
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), {
      error: "invalid",
    })
    .transform((v) => (v === "" ? null : Number(v)));

/** Required rupees amount above zero → paise. */
const priceField = rupeesField
  .refine((v) => v !== null && v > 0, { error: "invalidAmount" })
  .transform((v) => v ?? 0);
const rupeesOrZero = rupeesField.transform((v) => v ?? 0);

/** "Vrindavan, Mathura" → ["Vrindavan", "Mathura"] (trimmed, unique, up to `max`, each ≤ 60). */
export const commaListField = (max: number, maxLength = 60) =>
  z
    .string()
    .max(2000)
    .transform((v) => [
      ...new Set(
        v
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ])
    .refine((list) => list.length <= max && list.every((c) => c.length <= maxLength), { error: "invalid" });

/** One line per entry → trimmed, unique, non-empty entries. */
export const linesField = z
  .string()
  .max(6000)
  .transform((v) => [
    ...new Set(
      v
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ]);

/**
 * Editor rows of a localized list (highlights, inclusions, …). Rows left
 * empty in both languages are dropped; a Hindi-only row needs its English.
 */
export const localizedListField = z
  .array(
    z.object({
      en: z.string().trim().max(300, { error: "invalid" }),
      hi: z.string().trim().max(300, { error: "invalid" }).optional().nullable(),
    }),
  )
  .max(30)
  .superRefine((rows, ctx) => {
    rows.forEach((row, index) => {
      if (!row.en && row.hi) ctx.addIssue({ code: "custom", message: "required", path: [index, "en"] });
    });
  })
  .transform((rows) => rows.filter((r) => r.en).map((r) => ({ en: r.en, hi: r.hi || null })));
export type LocalizedListRowInput = { en: string; hi?: string | null };

export const packageIdSchema = z.object({ id: uuid });

// ---------------------------------------------------------------- packages

export const packageFormSchema = z
  .object({
    id: uuid.optional(),
    slug,
    title: localizedSchema,
    summary: localizedSchema,
    description: optionalLocalizedSchema,
    terms: optionalLocalizedSchema,
    /** Free-form grouping for filters ("braj", "pilgrimage", "heritage"). */
    category: slug,
    destinations: commaListField(20),
    start_city: text(80),
    duration_days: int(1, 60),
    duration_nights: int(0, 60),
    image_id: optionalUuid,
    gallery_ids: z.array(uuid).max(30),
    highlights: localizedListField,
    inclusions: localizedListField,
    exclusions: localizedListField,
    booking_mode: z.enum(PACKAGE_BOOKING_MODES),
    /** Group departures with dates and seats, or a private tour on any date. */
    fixed_departures: z.boolean(),
    min_pax: int(1, 100),
    max_pax: int(1, 100),
    /** Online advance in %; empty = the Settings default. */
    advance_percent: optionalInt(1, 100),
    /** GST in % ("5"); stored as basis points (max 28%). */
    gst_percent: percentField(28),
    sac,
    is_featured: z.boolean(),
    is_active: z.boolean(),
    sort_order: sortOrder,
  })
  .superRefine((p, ctx) => {
    if (p.duration_nights > p.duration_days) {
      ctx.addIssue({ code: "custom", message: "invalid", path: ["duration_nights"] });
    }
    if (p.max_pax < p.min_pax) ctx.addIssue({ code: "custom", message: "invalid", path: ["max_pax"] });
  });
export type PackageFormInput = z.input<typeof packageFormSchema>;
export type PackageForm = z.output<typeof packageFormSchema>;

// ---------------------------------------------------------------- itinerary, tiers, departures

export const itineraryDayFormSchema = z.object({
  id: uuid.optional(),
  package_id: uuid,
  day_number: int(1, 60),
  title: localizedSchema,
  description: optionalLocalizedSchema,
  meals: z
    .array(z.enum(MEALS))
    .max(3)
    .transform((list) => MEALS.filter((m) => list.includes(m))),
  overnight: text(120),
});
export type ItineraryDayFormInput = z.input<typeof itineraryDayFormSchema>;
export type ItineraryDayForm = z.output<typeof itineraryDayFormSchema>;

/** Price per traveller for a group size range; children pay the adult price when empty. */
export const pricingTierFormSchema = z
  .object({
    id: uuid.optional(),
    package_id: uuid,
    min_pax: int(1, 100),
    max_pax: int(1, 100),
    adult_price: priceField,
    child_price: rupeesField,
  })
  .refine((t) => t.max_pax >= t.min_pax, { error: "invalid", path: ["max_pax"] });
export type PricingTierFormInput = z.input<typeof pricingTierFormSchema>;
export type PricingTierForm = z.output<typeof pricingTierFormSchema>;

export const departureFormSchema = z.object({
  id: uuid.optional(),
  package_id: uuid,
  start_date: isoDate,
  /** Empty = no seat limit (on request). */
  seats_total: optionalInt(1, 1000),
  /** Added per traveller on this date (festival / peak season). */
  supplement: rupeesOrZero,
  note: optionalLocalizedSchema,
  is_active: z.boolean(),
});
export type DepartureFormInput = z.input<typeof departureFormSchema>;
export type DepartureForm = z.output<typeof departureFormSchema>;

// ---------------------------------------------------------------- list filters

/** `/admin/packages?status=…&mode=…&category=…&q=…`: invalid values are dropped. */
export const packageFiltersSchema = z.object({
  status: z.enum(PACKAGE_STATUSES).optional().catch(undefined),
  mode: z.enum(PACKAGE_BOOKING_MODES).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
});
export type PackageFilters = z.output<typeof packageFiltersSchema>;

// ---------------------------------------------------------------- settings

/** Admin form for `packages.defaults`; the stored value is re-checked with packagesSettingsSchema. */
export const packagesSettingsFormSchema = z.object({
  advance_percent: int(1, 100),
  hold_minutes: int(5, 120),
  book_until_days: int(0, 60),
  max_travellers: int(1, 100),
  cancellation_policy: localizedSchema,
});
export type PackagesSettingsFormInput = z.input<typeof packagesSettingsFormSchema>;
export type PackagesSettingsForm = z.output<typeof packagesSettingsFormSchema>;

/** Admin form for `leads.defaults`; sources and lost reasons are typed one per line. */
export const leadsSettingsFormSchema = z.object({
  auto_assign: z.enum(LEAD_AUTO_ASSIGN),
  max_per_phone_per_hour: int(1, 100),
  first_follow_up_hours: int(0, 168),
  quote_valid_hours: int(1, 720),
  /** Default GST on a new quote line in %; stored as basis points. */
  quote_gst_percent: percentField(28),
  quote_sac: sac,
  sources: linesField
    .transform((list) => list.map((s) => s.toLowerCase().replace(/\s+/g, "_")))
    .refine((list) => list.length >= 1, { error: "required" })
    .refine((list) => list.length <= 30 && list.every((s) => /^[a-z0-9_-]{2,40}$/.test(s)), {
      error: "invalid",
    }),
  lost_reasons: linesField
    .refine((list) => list.length >= 1, { error: "required" })
    .refine((list) => list.length <= 30 && list.every((r) => r.length >= 2 && r.length <= 120), {
      error: "invalid",
    }),
});
export type LeadsSettingsFormInput = z.input<typeof leadsSettingsFormSchema>;
export type LeadsSettingsForm = z.output<typeof leadsSettingsFormSchema>;

const classList = commaListField(10, 40).refine((list) => list.length >= 1, { error: "required" });

/** Admin form for `travel.defaults`. The provider is not editable here (only "manual" exists). */
export const travelSettingsFormSchema = z.object({
  max_travellers: int(1, 50),
  flight_classes: classList,
  train_classes: classList,
  bus_classes: classList,
  notice: localizedSchema,
});
export type TravelSettingsFormInput = z.input<typeof travelSettingsFormSchema>;
export type TravelSettingsForm = z.output<typeof travelSettingsFormSchema>;
