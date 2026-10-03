import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { BOOKING_SERVICES } from "./booking-admin";
import { percentField } from "./ride-admin";

/**
 * Admin insights (Phase 10): report date ranges, the Customers list filters
 * and staff actions (points, notes, block), and the Settings → Reviews &
 * rewards forms (`reviews.defaults`, `loyalty.defaults`). Field messages are
 * keys under `cms.errors` or `engagementSettings.errors`.
 */

const optionalDate = z.iso.date().optional().catch(undefined);

// ---------------------------------------------------------------- reports

export const RANGE_PRESETS = ["7", "30", "90", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** `?range=30` or `?range=custom&from=…&to=…` on the dashboard and report pages. */
export const reportRangeQuerySchema = z.object({
  range: z.enum(RANGE_PRESETS).optional().catch(undefined),
  from: optionalDate,
  to: optionalDate,
});
export type ReportRangeQuery = z.output<typeof reportRangeQuerySchema>;

export const REPORT_KEYS = ["sales", "occupancy", "vendors", "agents", "coupons", "cancellations"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

// ---------------------------------------------------------------- customers

const yesNo = z.enum(["yes", "no"]).optional().catch(undefined);

export const customerFiltersSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  blocked: yesNo,
  booked: yesNo,
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type CustomerFilters = z.output<typeof customerFiltersSchema>;

export const POINTS_ADJUST_MAX = 1_000_000;

/** A staff credit (+) or debit (−) of P&S Rewards points, with a reason. */
export const adjustPointsSchema = z.object({
  user_id: z.uuid(),
  points: z.coerce
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .min(-POINTS_ADJUST_MAX, { error: "invalid" })
    .max(POINTS_ADJUST_MAX, { error: "invalid" })
    .refine((n) => n !== 0, { error: "invalidAmount" }),
  note: z.string().trim().min(3, { error: "reasonRequired" }).max(300, { error: "invalid" }),
});
export type AdjustPointsInput = z.input<typeof adjustPointsSchema>;

export const customerNoteSchema = z.object({
  user_id: z.uuid(),
  body: z.string().trim().min(1, { error: "required" }).max(2000, { error: "invalid" }),
});
export type CustomerNoteInput = z.input<typeof customerNoteSchema>;

export const customerNoteDeleteSchema = z.object({ id: z.uuid(), user_id: z.uuid() });

export const customerBlockSchema = z.object({ user_id: z.uuid(), blocked: z.boolean() });

// ---------------------------------------------------------------- settings

/** A whole number typed into a form field. */
const wholeNumber = (min: number, max: number) =>
  z.coerce
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .min(min, { error: "invalid" })
    .max(max, { error: "invalid" });

/** Settings → Reviews: `reviews.defaults`. */
export const reviewsSettingsFormSchema = z.object({
  auto_publish: z.boolean(),
  window_days: wholeNumber(1, 3650),
  max_photos: wholeNumber(0, 10),
  max_photo_mb: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,2}(\.\d)?$/.test(v) && Number(v) >= 0.1 && Number(v) <= 10, { error: "invalid" })
    .transform(Number),
  min_body_chars: wholeNumber(0, 2000),
});
export type ReviewsSettingsFormInput = z.input<typeof reviewsSettingsFormSchema>;
export type ReviewsSettingsForm = z.output<typeof reviewsSettingsFormSchema>;

/** Settings → P&S Rewards: `loyalty.defaults`. Point value in rupees, earn rate in %. */
export const loyaltySettingsFormSchema = z
  .object({
    enabled: z.boolean(),
    point_value_rupees: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const paise = rupeesToPaise(v);
      if (paise === null || paise < 1 || paise > 100_000) {
        ctx.addIssue({ code: "custom", message: "invalid" });
        return z.NEVER;
      }
      return paise;
    }),
    earn_percent: percentField(100),
    earn_services: z.array(z.enum(BOOKING_SERVICES)).max(BOOKING_SERVICES.length).default([]),
    min_redeem_points: wholeNumber(1, POINTS_ADJUST_MAX),
    // Blank = no upper limit.
    max_redeem_points: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const text = String(v).trim();
      if (text === "") return null;
      if (!/^\d{1,7}$/.test(text) || Number(text) < 1) {
        ctx.addIssue({ code: "custom", message: "invalid" });
        return z.NEVER;
      }
      return Number(text);
    }),
    code_valid_days: wholeNumber(1, 365),
    expiry_days: wholeNumber(0, 3650),
    review_points: wholeNumber(0, 100_000),
    referrals_enabled: z.boolean(),
    referrer_points: wholeNumber(0, 100_000),
    referee_points: wholeNumber(0, 100_000),
  })
  .superRefine((form, ctx) => {
    if (form.max_redeem_points !== null && form.max_redeem_points < form.min_redeem_points) {
      ctx.addIssue({ code: "custom", path: ["max_redeem_points"], message: "maxBelowMin" });
    }
  });
export type LoyaltySettingsFormInput = z.input<typeof loyaltySettingsFormSchema>;
export type LoyaltySettingsForm = z.output<typeof loyaltySettingsFormSchema>;
