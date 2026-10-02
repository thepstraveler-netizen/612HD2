import { z } from "zod";
import { localizedSchema } from "@/lib/i18n/localized";
import { phoneSchema } from "./booking";

/**
 * Food, essentials and medicine delivery: settings, cart, checkout,
 * address book, prescription upload and quotes. Prices are never part of
 * customer input; the server prices the cart from the catalog.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const sac = z.string().regex(/^\d{4,8}$/);
export const uuid = z.uuid();

export const STORE_KINDS = ["restaurant", "grocery", "pharmacy"] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

/** The public shop each kind lives under. */
export const SHOP_OF_KIND = { restaurant: "food", grocery: "essentials", pharmacy: "medicine" } as const;
export type Shop = (typeof SHOP_OF_KIND)[StoreKind];
export const SHOPS = ["food", "essentials", "medicine"] as const;

export const DIETS = ["veg", "egg", "non_veg", "na"] as const;
export type Diet = (typeof DIETS)[number];

export const ORDER_STATUSES = [
  "awaiting_payment",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "rejected",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRESCRIPTION_STATUSES = [
  "submitted",
  "reviewing",
  "quoted",
  "ordered",
  "rejected",
  "expired",
] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

/** `settings` key `delivery.defaults` (admin → Settings → Delivery). Public: its terms are shown at checkout. */
export const deliverySettingsSchema = z.object({
  /** Riders (and stores delivering themselves) need the customer's 4-digit OTP to mark an order delivered. */
  require_delivery_otp: z.boolean().default(true),
  cod_enabled: z.boolean().default(true),
  /** Cash on delivery only up to this order total. */
  max_cod_paise: z.number().int().min(0).default(300_000),
  /** Minutes an unpaid online order holds its stock. */
  hold_minutes: z.number().int().min(5).max(60).default(15),
  delivery_tax_bps: z.number().int().min(0).max(2800).default(1800),
  delivery_sac: sac.default("996813"),
  /** Restaurant service (food). */
  food_sac: sac.default("996331"),
  /** Goods sold by stores and pharmacies (items carry their HSN where set). */
  goods_sac: sac.default("996211"),
  quote_valid_hours: z.number().int().min(1).max(168).default(24),
  /** Most distinct lines in one cart. */
  max_items: z.number().int().min(1).max(99).default(30),
  /** Customers may cancel themselves until the store accepts ("placed") or never ("never"). */
  cancel_until: z.enum(["placed", "never"]).default("placed"),
  medicine_notice: localizedSchema.default({
    en: "Medicines are supplied only by licensed partner pharmacies against a valid prescription. Prescription drugs are never sold without one.",
    hi: null,
  }),
});
export type DeliverySettings = z.output<typeof deliverySettingsSchema>;
export type DeliverySettingsInput = z.input<typeof deliverySettingsSchema>;

/** Weekly opening hours, India time. Mon = 1 … Sun = 7; close "24:00" = midnight; close < open runs past midnight. */
export const storeHoursSchema = z
  .array(z.object({ day: z.number().int().min(1).max(7), open: hhmm, close: hhmm }))
  .max(21);
export type StoreHours = z.output<typeof storeHoursSchema>;

/** One cart line as the browser keeps it (Zustand, localStorage). */
export const cartLineSchema = z.object({
  itemId: uuid,
  variantId: uuid.nullable().default(null),
  addonIds: z.array(uuid).max(20).default([]),
  qty: z.number().int().min(1).max(99),
});
export type CartLine = z.output<typeof cartLineSchema>;
export type CartLineInput = z.input<typeof cartLineSchema>;

export const deliveryAddressSchema = z.object({
  contactName: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(3, { error: "required" }).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  pincode: z
    .union([z.literal(""), z.string().regex(/^[1-9][0-9]{5}$/, { error: "invalidPincode" })])
    .optional(),
  zoneId: uuid,
});
export type DeliveryAddress = z.output<typeof deliveryAddressSchema>;
export type DeliveryAddressInput = z.input<typeof deliveryAddressSchema>;

export const savedAddressSchema = deliveryAddressSchema.extend({
  label: z.string().trim().min(1).max(40).default("Home"),
  isDefault: z.boolean().default(false),
});
export type SavedAddressInput = z.input<typeof savedAddressSchema>;

/** online = pay now (Razorpay); cod = cash on delivery (bookings.payment_mode pay_at_hotel). */
export const ORDER_PAYMENT_MODES = ["online", "cod"] as const;
export type OrderPaymentMode = (typeof ORDER_PAYMENT_MODES)[number];

/** Cart preview (no address yet): store, zone, lines, coupon. */
export const cartQuoteSchema = z.object({
  storeId: uuid,
  zoneId: uuid.optional(),
  lines: z.array(cartLineSchema).min(1).max(99),
  coupon: z.string().trim().max(24).optional(),
  pay: z.enum(ORDER_PAYMENT_MODES).default("cod"),
});
export type CartQuoteInput = z.input<typeof cartQuoteSchema>;
export type CartQuote = z.output<typeof cartQuoteSchema>;

export const orderCheckoutSchema = cartQuoteSchema.extend({
  address: deliveryAddressSchema,
  email: z.union([z.literal(""), z.email({ error: "invalidEmail" }).max(200)]).optional(),
  notes: z.string().trim().max(500).optional(),
  saveAddress: z.boolean().default(false),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type OrderCheckoutInput = z.input<typeof orderCheckoutSchema>;
export type OrderCheckout = z.output<typeof orderCheckoutSchema>;

export const rateOrderSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6,20}$/),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

/** Prescription upload (files are first uploaded to the private bucket under "<user id>/"). */
export const prescriptionSchema = z.object({
  patientName: z.string().trim().min(2, { error: "required" }).max(120),
  patientAge: z.union([z.literal(""), z.coerce.number().int().min(0).max(120)]).optional(),
  address: deliveryAddressSchema,
  files: z.array(z.string().min(3).max(300)).min(1, { error: "required" }).max(5),
  notes: z.string().trim().max(1000).optional(),
});
export type PrescriptionInput = z.input<typeof prescriptionSchema>;

export const quoteLineSchema = z.object({
  name: z.string().trim().min(2).max(160),
  pack: z.string().trim().max(80).optional().default(""),
  qty: z.number().int().min(1).max(99),
  unit_price_paise: z.number().int().min(1).max(10_000_000),
  tax_bps: z.number().int().min(0).max(2800).default(1200),
  hsn: z
    .union([z.literal(""), z.string().regex(/^[0-9]{4,8}$/)])
    .optional()
    .default(""),
});
export type QuoteLine = z.output<typeof quoteLineSchema>;
export const quoteLinesSchema = z.array(quoteLineSchema).min(1).max(50);

/** Staff / pharmacy → quote for a prescription. */
export const medicineQuoteSchema = z.object({
  prescriptionId: uuid,
  storeId: uuid,
  lines: quoteLinesSchema,
  deliveryFeePaise: z.number().int().min(0).max(1_000_000).default(0),
  note: z.string().trim().max(1000).optional(),
});
export type MedicineQuoteInput = z.input<typeof medicineQuoteSchema>;

/** Customer accepts a quote and pays (online) or chooses cash on delivery. */
export const acceptQuoteSchema = z.object({
  quoteId: uuid,
  pay: z.enum(ORDER_PAYMENT_MODES).default("cod"),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type AcceptQuoteInput = z.input<typeof acceptQuoteSchema>;
