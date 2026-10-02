import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";
import { normalizePhone } from "./booking";
import { DIETS, STORE_KINDS } from "./delivery";
import { percentField, rupeesField } from "./ride-admin";

/**
 * Admin schemas for Phase 7 (food, essentials and medicine delivery):
 * stores and partner pharmacies, the menu (categories, items, variants,
 * add-ons), delivery zones, riders, order dispatch, the board and
 * settlement filters, prescription review, the medicine quote builder and
 * the Settings → Delivery form.
 *
 * Money is typed in rupees and leaves these schemas as integer paise;
 * GST is typed as % and becomes basis points in the row mappers
 * (lib/delivery/admin-rows.ts). Field messages are keys under `cms.errors`
 * so the shared form fields translate them.
 */

export { DIETS, STORE_KINDS };

/** Store kinds under Admin → Food & Essentials; pharmacies live under Admin → Medicine. */
export const FOOD_KINDS = ["restaurant", "grocery"] as const;
export const PHARMACY_KINDS = ["pharmacy"] as const;

/** Moves staff can make (set_order_status, source admin: no delivery OTP). */
export const ORDER_MOVES = [
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "rejected",
] as const;
export type OrderMove = (typeof ORDER_MOVES)[number];

/** Prescription queue tabs: "open" = submitted + reviewing (the default). */
export const PRESCRIPTION_TABS = ["open", "quoted", "ordered", "rejected", "expired", "all"] as const;
export type PrescriptionTab = (typeof PRESCRIPTION_TABS)[number];

export const CANCEL_UNTIL = ["placed", "never"] as const;

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
const rupeesOrZero = rupeesField.transform((v) => v ?? 0);
const sac = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, { error: "invalid" });
const hsn = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9]{4,8}$/.test(v), { error: "invalid" });

/** Empty → null; otherwise a whole number in [min, max]. */
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" && Number.isNaN(v) ? "" : String(v).trim()))
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), {
      error: "invalid",
    })
    .transform((v) => (v === "" ? null : Number(v)));

/** Empty → null; otherwise a coordinate in [min, max]. */
const optionalCoordinate = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), {
      error: "invalidCoordinate",
    })
    .transform((v) => (v === "" ? null : Number(v)));

/** Optional phone: empty → null, else normalised like checkout (+91…). */
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizePhone(v) !== null, { error: "invalidPhone" })
  .transform((v) => (v === "" ? null : normalizePhone(v)));

const requiredPhone = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, { error: "invalidPhone" })
  .transform((v) => normalizePhone(v) ?? v);

/** Required rupees amount above zero. */
const priceField = rupeesField
  .refine((v) => v !== null && v > 0, { error: "invalidAmount" })
  .transform((v) => v ?? 0);

/** "HH:MM" from <input type="time">. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "invalidTime" });

export const deliveryIdSchema = z.object({ id: uuid });

// ---------------------------------------------------------------- stores

/** One opening slot. close < open runs past midnight (close 00:00 = until midnight). */
export const storeHoursRowSchema = z
  .object({ day: int(1, 7), open: hhmm, close: hhmm })
  .refine((s) => s.open !== s.close, { error: "invalidTime", path: ["close"] });
export type StoreHoursRowInput = z.input<typeof storeHoursRowSchema>;

/** "North Indian, Chinese" → ["North Indian", "Chinese"] (trimmed, unique, up to 12). */
export const cuisinesField = z
  .string()
  .max(600)
  .transform((v) => [
    ...new Set(
      v
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ])
  .refine((list) => list.length <= 12 && list.every((c) => c.length <= 40), { error: "invalid" });

export const storeFormSchema = z
  .object({
    id: uuid.optional(),
    vendor_id: z.string().refine((v) => z.uuid().safeParse(v).success, { error: "required" }),
    kind: z.enum(STORE_KINDS),
    slug,
    name: localizedSchema,
    description: optionalLocalizedSchema,
    cuisines: cuisinesField,
    image_id: optionalUuid,
    address: text(300),
    phone: optionalPhone,
    lat: optionalCoordinate(-90, 90),
    lng: optionalCoordinate(-180, 180),
    pure_veg: z.boolean(),
    is_24x7: z.boolean(),
    hours: z.array(storeHoursRowSchema).max(21),
    accepting_orders: z.boolean(),
    prep_minutes: int(0, 240),
    min_order: rupeesOrZero,
    packaging_fee: rupeesOrZero,
    /** GST on items (unless an item sets its own) in %; stored as basis points. */
    gst_percent: percentField(28),
    /** Required for pharmacies (D-062). */
    drug_licence_no: text(80),
    zone_ids: z.array(uuid).max(50),
    is_featured: z.boolean(),
    is_active: z.boolean(),
    sort_order: sortOrder,
  })
  .superRefine((s, ctx) => {
    if (s.kind === "pharmacy" && !s.drug_licence_no) {
      ctx.addIssue({ code: "custom", message: "required", path: ["drug_licence_no"] });
    }
    if ((s.lat === null) !== (s.lng === null)) {
      ctx.addIssue({ code: "custom", message: "invalidCoordinate", path: [s.lat === null ? "lat" : "lng"] });
    }
  });
export type StoreFormInput = z.input<typeof storeFormSchema>;
export type StoreForm = z.output<typeof storeFormSchema>;

/** Pause / resume orders from the stores list. */
export const storeToggleSchema = z.object({ id: uuid, accepting_orders: z.boolean() });

// ---------------------------------------------------------------- menu

export const categoryFormSchema = z.object({
  id: uuid.optional(),
  store_id: uuid,
  name: localizedSchema,
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type CategoryFormInput = z.input<typeof categoryFormSchema>;
export type CategoryForm = z.output<typeof categoryFormSchema>;

/** Mirrors the store_items checks: Jain / Sattvik only for veg (or n/a); tracked stock needs a count. */
export const itemFormSchema = z
  .object({
    id: uuid.optional(),
    store_id: uuid,
    category_id: optionalUuid,
    name: localizedSchema,
    description: optionalLocalizedSchema,
    image_id: optionalUuid,
    diet: z.enum(DIETS),
    is_jain: z.boolean(),
    is_sattvik: z.boolean(),
    price: priceField,
    /** Printed MRP; empty = none. */
    mrp: rupeesField,
    /** Empty = the store's rate. */
    gst_percent: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim().replace(/%$/, ""))
      .refine((v) => v === "" || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 28), { error: "invalid" })
      .transform((v) => (v === "" ? null : Number(v))),
    hsn,
    unit: text(40),
    track_stock: z.boolean(),
    stock: optionalInt(0, 1_000_000),
    is_available: z.boolean(),
    is_bestseller: z.boolean(),
    sort_order: sortOrder,
  })
  .superRefine((item, ctx) => {
    const meat = item.diet === "egg" || item.diet === "non_veg";
    if (meat && (item.is_jain || item.is_sattvik)) {
      ctx.addIssue({ code: "custom", message: "invalid", path: ["diet"] });
    }
    if (item.mrp !== null && item.mrp < item.price) {
      ctx.addIssue({ code: "custom", message: "invalidAmount", path: ["mrp"] });
    }
    if (item.track_stock && item.stock === null) {
      ctx.addIssue({ code: "custom", message: "required", path: ["stock"] });
    }
  });
export type ItemFormInput = z.input<typeof itemFormSchema>;
export type ItemForm = z.output<typeof itemFormSchema>;

export const itemAvailabilitySchema = z.object({ id: uuid, is_available: z.boolean() });
export const itemStockSchema = z.object({ id: uuid, stock: int(0, 1_000_000) });

export const variantFormSchema = z.object({
  id: uuid.optional(),
  item_id: uuid,
  name: localizedSchema,
  price: priceField,
  stock: optionalInt(0, 1_000_000),
  is_available: z.boolean(),
  sort_order: sortOrder,
});
export type VariantFormInput = z.input<typeof variantFormSchema>;
export type VariantForm = z.output<typeof variantFormSchema>;

export const addonGroupFormSchema = z
  .object({
    id: uuid.optional(),
    item_id: uuid,
    name: localizedSchema,
    min_select: int(0, 10),
    max_select: int(1, 10),
    sort_order: sortOrder,
  })
  .refine((g) => g.min_select <= g.max_select, { error: "invalid", path: ["max_select"] });
export type AddonGroupFormInput = z.input<typeof addonGroupFormSchema>;
export type AddonGroupForm = z.output<typeof addonGroupFormSchema>;

export const addonFormSchema = z.object({
  id: uuid.optional(),
  group_id: uuid,
  name: localizedSchema,
  price: rupeesOrZero,
  is_available: z.boolean(),
  sort_order: sortOrder,
});
export type AddonFormInput = z.input<typeof addonFormSchema>;
export type AddonForm = z.output<typeof addonFormSchema>;

// ---------------------------------------------------------------- zones and riders

export const deliveryZoneFormSchema = z.object({
  id: uuid.optional(),
  slug,
  name: localizedSchema,
  fee: rupeesOrZero,
  /** Items at or above this deliver free; empty = never free. */
  free_above: rupeesField,
  eta_minutes: int(5, 600),
  is_active: z.boolean(),
  sort_order: sortOrder,
});
export type DeliveryZoneFormInput = z.input<typeof deliveryZoneFormSchema>;
export type DeliveryZoneForm = z.output<typeof deliveryZoneFormSchema>;

export const riderFormSchema = z.object({
  id: uuid.optional(),
  full_name: z.string().trim().min(2, { error: "required" }).max(120),
  phone: requiredPhone,
  vehicle: text(60),
  /** Empty = a platform rider who can serve any store. */
  vendor_id: optionalUuid,
  is_active: z.boolean(),
  notes: text(1000),
});
export type RiderFormInput = z.input<typeof riderFormSchema>;
export type RiderForm = z.output<typeof riderFormSchema>;

// ---------------------------------------------------------------- dispatch

export const orderMoveSchema = z
  .object({
    orderId: uuid,
    status: z.enum(ORDER_MOVES),
    note: z.string().trim().max(500).optional(),
  })
  .refine((m) => m.status !== "rejected" || (m.note ?? "").length >= 3, {
    error: "required",
    path: ["note"],
  });
export type OrderMoveInput = z.input<typeof orderMoveSchema>;

export const orderAssignSchema = z.object({ orderId: uuid, partnerId: uuid });
export const orderRefSchema = z.object({ orderId: uuid });

/** `/admin/food?store=…`: an invalid value is dropped so a stale link still opens. */
export const orderBoardFiltersSchema = z.object({
  store: uuid.optional().catch(undefined),
});
export type OrderBoardFilters = z.output<typeof orderBoardFiltersSchema>;

/** `/admin/food/settlements?from=…&to=…`: India dates; invalid values fall back to this month. */
export const settlementFiltersSchema = z.object({
  from: z.string().refine(isIsoDate).optional().catch(undefined),
  to: z.string().refine(isIsoDate).optional().catch(undefined),
});

// ---------------------------------------------------------------- prescriptions and quotes

export const prescriptionTabSchema = z.enum(PRESCRIPTION_TABS).catch("open");

export const prescriptionRejectSchema = z.object({
  id: uuid,
  reason: z.string().trim().min(3, { error: "required" }).max(1000),
});

export const prescriptionAssignSchema = z.object({ id: uuid, store_id: optionalUuid });

export const quoteLineFormSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(160),
  pack: z.string().trim().max(80),
  qty: int(1, 99),
  unit_price: priceField,
  /** GST on this medicine in % (usually 5 or 12). */
  gst_percent: percentField(28),
  hsn,
});
export type QuoteLineFormInput = z.input<typeof quoteLineFormSchema>;

export const quoteFormSchema = z.object({
  prescription_id: uuid,
  store_id: z.string().refine((v) => z.uuid().safeParse(v).success, { error: "required" }),
  lines: z.array(quoteLineFormSchema).min(1, { error: "required" }).max(50),
  delivery_fee: rupeesOrZero,
  note: text(1000),
});
export type QuoteFormInput = z.input<typeof quoteFormSchema>;
export type QuoteForm = z.output<typeof quoteFormSchema>;

// ---------------------------------------------------------------- settings

/** Admin form for `delivery.defaults`; the stored value is re-checked with deliverySettingsSchema. */
export const deliverySettingsFormSchema = z.object({
  require_delivery_otp: z.boolean(),
  cod_enabled: z.boolean(),
  max_cod: rupeesOrZero,
  hold_minutes: int(5, 60),
  delivery_gst_percent: percentField(28),
  delivery_sac: sac,
  food_sac: sac,
  goods_sac: sac,
  quote_valid_hours: int(1, 168),
  max_items: int(1, 99),
  cancel_until: z.enum(CANCEL_UNTIL),
  medicine_notice: localizedSchema,
});
export type DeliverySettingsFormInput = z.input<typeof deliverySettingsFormSchema>;
export type DeliverySettingsForm = z.output<typeof deliverySettingsFormSchema>;
