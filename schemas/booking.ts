import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

/**
 * Checkout and booking schemas. The review page posts these to server
 * actions, which parse them again: nothing the browser sends is trusted,
 * and prices are never part of the input.
 */

const isoDate = z.string().refine(isIsoDate, { error: "invalidDate" });
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const PAYMENT_MODES = ["full", "part", "pay_at_hotel"] as const;
export type PaymentModeKey = (typeof PAYMENT_MODES)[number];

/** What is being bought: the stay, add-ons, coupon and how to pay. */
export const hotelCheckoutSchema = z.object({
  hotel: z.string().regex(/^[a-z0-9-]+$/),
  plan: z.uuid(),
  checkin: isoDate,
  checkout: isoDate,
  rooms: int(1, 8),
  adults: int(1, 30),
  children: int(0, 20).default(0),
  addons: z
    .object({
      early_checkin: z.boolean().optional(),
      late_checkout: z.boolean().optional(),
      breakfast: z.boolean().optional(),
    })
    .default({}),
  coupon: z.string().trim().max(24).optional(),
  paymentMode: z.enum(PAYMENT_MODES).default("full"),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type HotelCheckoutInput = z.input<typeof hotelCheckoutSchema>;
export type HotelCheckout = z.output<typeof hotelCheckoutSchema>;

/** Indian mobile numbers become +91XXXXXXXXXX; other numbers need a leading +. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "");
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9][0-9]{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^(\+91|91)[6-9][0-9]{9}$/.test(digits)) return `+91${digits.slice(-10)}`;
  if (/^\+[1-9][0-9]{9,14}$/.test(digits)) return digits;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return phone;
  });

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const gstDetailsSchema = z.object({
  gstin: z.string().trim().toUpperCase().regex(GSTIN_PATTERN, { error: "invalidGstin" }),
  company: z.string().trim().min(2, { error: "required" }).max(160),
  address: z.string().trim().max(300).default(""),
});

/** Who is travelling: primary contact, other guests, requests, optional GST details. */
export const guestDetailsSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(120),
  email: z.email({ error: "invalidEmail" }).or(z.literal("")).default(""),
  phone: phoneSchema,
  guests: z.array(z.string().trim().max(120)).max(30).default([]),
  specialRequests: z.string().trim().max(1000).default(""),
  wantsGst: z.boolean().default(false),
  gst: gstDetailsSchema.optional(),
  acceptPolicies: z.literal(true, { error: "acceptPolicies" }),
});
export type GuestDetailsInput = z.input<typeof guestDetailsSchema>;

export const bookHotelSchema = z.object({ checkout: hotelCheckoutSchema, guest: guestDetailsSchema });

export const verifyPaymentSchema = z.object({
  bookingCode: z.string().regex(/^[A-Z0-9]{6,16}$/),
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const bookingCodeSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{6,16}$/) });

// ---------------------------------------------------------------- settings

export const paymentSettingsSchema = z.object({
  /** Fallback advance % for hotels without their own, when part payment is on everywhere. */
  advance_percent: z.number().int().min(1).max(99).default(25),
  part_payment_enabled: z.boolean().default(false),
  convenience_fee_paise: z.number().int().min(0).max(1_000_000).default(0),
  fee_tax_bps: z.number().int().min(0).max(10_000).default(1800),
  /** Global switch over each hotel's own pay-at-hotel option. */
  pay_at_hotel_enabled: z.boolean().default(true),
  /** How long an unpaid booking holds its rooms. */
  hold_minutes: z.number().int().min(5).max(30).default(15),
  customer_cancellation_enabled: z.boolean().default(true),
});
export type PaymentSettings = z.output<typeof paymentSettingsSchema>;

export const invoiceSettingsSchema = z.object({
  legal_name: z.string().trim().min(2).max(160).default("The P & S Traveler Group"),
  state: z.string().trim().max(60).default("Uttar Pradesh"),
  state_code: z
    .string()
    .regex(/^[0-9]{2}$/)
    .default("09"),
  prefix: z
    .string()
    .regex(/^[A-Z]{2,6}$/)
    .default("PST"),
  sac_accommodation: z
    .string()
    .regex(/^[0-9]{6}$/)
    .default("996311"),
  sac_services: z
    .string()
    .regex(/^[0-9]{6}$/)
    .default("998552"),
  terms: z.string().trim().max(500).default(""),
});
export type InvoiceSettings = z.output<typeof invoiceSettingsSchema>;
