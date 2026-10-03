import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { localizedSchema } from "@/lib/i18n/localized";
import { phoneSchema } from "./booking";

/**
 * Tour packages, flight / train / bus enquiries and the public enquiry
 * forms that feed the leads CRM. Prices are never part of customer input:
 * the server prices a package from the catalog and agents price quotes.
 */

const isoDate = z.string().refine(isIsoDate, { error: "invalidDate" });
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const locale = z.enum(["en", "hi"]).default("en");
const slug = z.string().regex(/^[a-z0-9-]+$/);

export const PACKAGE_BOOKING_MODES = ["enquiry", "book"] as const;
export type PackageBookingMode = (typeof PACKAGE_BOOKING_MODES)[number];

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export const TRAVEL_MODES = ["flight", "train", "bus"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const LEAD_KINDS = [
  "package",
  "flight",
  "train",
  "bus",
  "hotel",
  "cab",
  "service",
  "general",
] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/** `settings` key `packages.defaults` (admin → Settings → Packages & leads). Public. */
export const packagesSettingsSchema = z.object({
  /** % of the total taken online when a package has no advance of its own. */
  advance_percent: z.number().int().min(1).max(100).default(25),
  /** Minutes an unpaid booking holds its seats. */
  hold_minutes: z.number().int().min(5).max(120).default(20),
  /** Online booking closes this many days before departure (enquiries stay open). */
  book_until_days: z.number().int().min(0).max(60).default(2),
  max_travellers: z.number().int().min(1).max(100).default(20),
  cancellation_policy: localizedSchema.default({
    en: "Free cancellation up to 15 days before departure; charges apply after that.",
    hi: null,
  }),
});
export type PackagesSettings = z.output<typeof packagesSettingsSchema>;
export type PackagesSettingsInput = z.input<typeof packagesSettingsSchema>;

/** `settings` key `travel.defaults`. Public: the search form reads it. */
export const travelSettingsSchema = z.object({
  /** Inventory adapter: "manual" = enquiry and quote (lib/travel/provider.ts). */
  provider: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .default("manual"),
  max_travellers: z.number().int().min(1).max(50).default(9),
  classes: z
    .object({
      flight: z.array(z.string().min(1).max(40)).max(10).default(["economy", "premium_economy", "business"]),
      train: z.array(z.string().min(1).max(40)).max(10).default(["SL", "3A", "2A", "1A", "CC", "EC"]),
      bus: z
        .array(z.string().min(1).max(40))
        .max(10)
        .default(["seater", "sleeper", "ac_seater", "ac_sleeper"]),
    })
    .default({
      flight: ["economy", "premium_economy", "business"],
      train: ["SL", "3A", "2A", "1A", "CC", "EC"],
      bus: ["seater", "sleeper", "ac_seater", "ac_sleeper"],
    }),
  notice: localizedSchema.default({
    en: "Tell us where and when; our travel desk replies with the best fares. You pay only after you approve the quote.",
    hi: null,
  }),
});
export type TravelSettings = z.output<typeof travelSettingsSchema>;
export type TravelSettingsInput = z.input<typeof travelSettingsSchema>;

/** Where a visitor came from: UTM tags, referrer and landing page (read in the browser, re-checked here). */
export const attributionSchema = z
  .object({
    source: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_-]{2,40}$/)
      .optional()
      .catch(undefined),
    utm: z
      .object({
        source: z.string().trim().max(80).optional(),
        medium: z.string().trim().max(80).optional(),
        campaign: z.string().trim().max(120).optional(),
        term: z.string().trim().max(120).optional(),
        content: z.string().trim().max(120).optional(),
      })
      .default({})
      .catch({}),
    referrer: z.string().trim().max(500).optional().catch(undefined),
    landingPath: z.string().trim().max(500).optional().catch(undefined),
  })
  .default({ utm: {} });
export type Attribution = z.output<typeof attributionSchema>;

const contact = {
  name: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  email: z.union([z.literal(""), z.email({ error: "invalidEmail" }).max(200)]).default(""),
  message: z.string().trim().max(2000).default(""),
  /** Honeypot: real visitors never fill it. */
  website: z.string().max(0).optional().default(""),
  /** Cloudflare Turnstile token (checked server-side only when configured). */
  turnstileToken: z.string().trim().max(2048).optional(),
  attribution: attributionSchema,
  locale,
};

/** Package page → "Enquire". */
export const packageEnquirySchema = z.object({
  kind: z.literal("package"),
  packageSlug: slug,
  startDate: z.union([z.literal(""), isoDate]).default(""),
  adults: int(1, 100).default(2),
  children: int(0, 100).default(0),
  ...contact,
});

/** /travel → flight, train or bus enquiry. */
export const travelEnquirySchema = z
  .object({
    kind: z.enum(TRAVEL_MODES),
    from: z.string().trim().min(2, { error: "required" }).max(80),
    to: z.string().trim().min(2, { error: "required" }).max(80),
    departOn: isoDate,
    returnOn: z.union([z.literal(""), isoDate]).default(""),
    adults: int(1, 50).default(1),
    children: int(0, 50).default(0),
    travelClass: z.string().trim().max(40).default(""),
    ...contact,
  })
  .superRefine((v, ctx) => {
    if (v.from.toLowerCase() === v.to.toLowerCase())
      ctx.addIssue({ code: "custom", path: ["to"], message: "sameCity" });
    if (v.returnOn && v.returnOn < v.departOn)
      ctx.addIssue({ code: "custom", path: ["returnOn"], message: "returnBeforeDepart" });
  });

/** Enquiry-only service pages (calling centre, photography, …) and the generic contact form. */
export const serviceEnquirySchema = z.object({
  kind: z.enum(["service", "general", "hotel", "cab"]),
  serviceSlug: z.union([z.literal(""), slug]).default(""),
  /** A plan picked on a B2B service page (optional). */
  planId: z.union([z.literal(""), z.uuid()]).default(""),
  ...contact,
});

export const enquirySchema = z.union([packageEnquirySchema, travelEnquirySchema, serviceEnquirySchema]);
export type EnquiryInput = z.input<typeof enquirySchema>;
export type Enquiry = z.output<typeof enquirySchema>;
export type PackageEnquiryInput = z.input<typeof packageEnquirySchema>;
export type TravelEnquiryInput = z.input<typeof travelEnquirySchema>;
export type ServiceEnquiryInput = z.input<typeof serviceEnquirySchema>;

/** What is being booked online (prices come from the catalog). */
export const packageCheckoutSchema = z.object({
  packageSlug: slug,
  /** Required for fixed-departure packages. */
  departureId: z.uuid().optional(),
  /** The departure's date, or any date for private tours. */
  startDate: isoDate,
  adults: int(1, 100),
  children: int(0, 100).default(0),
  coupon: z.string().trim().max(24).optional(),
  /** part = the advance; full = pay everything now. */
  paymentMode: z.enum(["full", "part"]).default("part"),
  locale,
});
export type PackageCheckoutInput = z.input<typeof packageCheckoutSchema>;
export type PackageCheckout = z.output<typeof packageCheckoutSchema>;

export const packageTravellersSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(120),
  email: z.union([z.literal(""), z.email({ error: "invalidEmail" }).max(200)]).default(""),
  phone: phoneSchema,
  travellers: z
    .array(
      z.object({
        name: z.string().trim().max(120),
        age: z.union([z.literal(""), int(0, 120)]).default(""),
      }),
    )
    .max(100)
    .default([]),
  pickupPoint: z.string().trim().max(200).default(""),
  specialRequests: z.string().trim().max(1000).default(""),
  acceptPolicies: z.literal(true, { error: "acceptPolicies" }),
});
export type PackageTravellersInput = z.input<typeof packageTravellersSchema>;
export type PackageTravellers = z.output<typeof packageTravellersSchema>;
