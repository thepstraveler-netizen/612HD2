import { z } from "zod";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";

/**
 * Zod schemas for everything editable in the CMS. Shared by the admin forms
 * (client), the server actions (server) and the public renderers, which
 * `safeParse` stored JSON so one bad row can never break the home page.
 */

export const SERVICE_ACCENTS = [
  "blue",
  "teal",
  "purple",
  "pink",
  "green",
  "amber",
  "red",
  "orange",
  "magenta",
  "indigo",
] as const;
export const OFFER_TABS = ["all", "hotels", "cabs", "food", "packages"] as const;
export const SEARCH_TABS = ["hotels", "cabs", "rides", "packages", "travel"] as const;
export const NAV_MENUS = ["header", "footer_company", "footer_legal"] as const;

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, { error: "invalidSlug" })
  .max(80);
const sortOrder = z.coerce.number().int().min(0).max(10_000);
const internalHref = z.string().trim().regex(/^\//, { error: "invalidHref" }).max(300);
const anyHref = z
  .string()
  .trim()
  .regex(/^(\/|https:\/\/)/, { error: "invalidHref" })
  .max(300);
const uuid = z.uuid();

// ---------------------------------------------------------------- sections

export const sectionContentSchemas = {
  hero: z.object({
    tagline: localizedSchema.optional(),
    search_tabs: z.array(z.enum(SEARCH_TABS)).default([...SEARCH_TABS]),
  }),
  pillars: z.object({
    items: z
      .array(z.object({ icon: z.string(), label: localizedSchema }))
      .max(8)
      .default([]),
  }),
  about: z.object({ body: localizedSchema }),
  services: z.object({}).loose(),
  offers: z.object({}).loose(),
  testimonials: z.object({}).loose(),
  faqs: z.object({}).loose(),
  why_collaborate: z.object({
    partner_types: z.array(localizedSchema).max(12).default([]),
    points: z
      .array(z.object({ icon: z.string(), text: localizedSchema }))
      .max(12)
      .default([]),
  }),
  partner_cta: z.object({ cta_label: localizedSchema, href: internalHref }),
} as const;

export type SectionType = keyof typeof sectionContentSchemas;
export type SectionContent<T extends SectionType> = z.infer<(typeof sectionContentSchemas)[T]>;

export const sectionFormSchema = z.object({
  id: uuid,
  title: optionalLocalizedSchema,
  subtitle: optionalLocalizedSchema,
  contentJson: z.string().max(20_000),
  sort_order: sortOrder,
  is_visible: z.boolean(),
});
export type SectionFormInput = z.input<typeof sectionFormSchema>;

// ---------------------------------------------------------------- services

export const serviceFormSchema = z.object({
  id: uuid.optional(),
  slug,
  kind: z.enum(["bookable", "enquiry"]),
  accent: z.enum(SERVICE_ACCENTS),
  icon: z.string().trim().min(1).max(40),
  name: localizedSchema,
  summary: localizedSchema,
  description: optionalLocalizedSchema,
  highlights: z.array(localizedSchema).max(10).default([]),
  cta_label: optionalLocalizedSchema,
  hero_media_id: uuid.nullable().optional(),
  sort_order: sortOrder,
  is_published: z.boolean(),
  show_in_nav: z.boolean(),
});
export type ServiceFormInput = z.input<typeof serviceFormSchema>;

// ---------------------------------------------------------------- banners

export const bannerFormSchema = z
  .object({
    id: uuid.optional(),
    tab: z.enum(OFFER_TABS),
    title: localizedSchema,
    subtitle: optionalLocalizedSchema,
    coupon_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, { error: "invalidCoupon" })
      .or(z.literal(""))
      .transform((v) => v || null),
    cta_label: optionalLocalizedSchema,
    href: internalHref.or(z.literal("")).transform((v) => v || null),
    media_id: uuid.nullable().optional(),
    accent: z.enum(SERVICE_ACCENTS),
    starts_at: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v).toISOString() : null)),
    ends_at: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v).toISOString() : null)),
    sort_order: sortOrder,
    is_active: z.boolean(),
  })
  .refine((v) => !v.starts_at || !v.ends_at || v.ends_at > v.starts_at, {
    error: "endBeforeStart",
    path: ["ends_at"],
  });
export type BannerFormInput = z.input<typeof bannerFormSchema>;

// ---------------------------------------------------------------- testimonials / faqs / nav

export const testimonialFormSchema = z.object({
  id: uuid.optional(),
  author_name: z.string().trim().min(2, { error: "required" }).max(80),
  author_place: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  quote: localizedSchema,
  rating: z.coerce.number().int().min(1).max(5),
  sort_order: sortOrder,
  is_published: z.boolean(),
});
export type TestimonialFormInput = z.input<typeof testimonialFormSchema>;

export const faqFormSchema = z.object({
  id: uuid.optional(),
  service_id: uuid.or(z.literal("")).transform((v) => v || null),
  question: localizedSchema,
  answer: localizedSchema,
  sort_order: sortOrder,
  is_published: z.boolean(),
});
export type FaqFormInput = z.input<typeof faqFormSchema>;

export const navLinkFormSchema = z.object({
  id: uuid.optional(),
  menu: z.enum(NAV_MENUS),
  label: localizedSchema,
  href: anyHref,
  sort_order: sortOrder,
  is_visible: z.boolean(),
});
export type NavLinkFormInput = z.input<typeof navLinkFormSchema>;

// ---------------------------------------------------------------- settings

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ]{8,16})?$/, { error: "invalidPhone" }),
  whatsapp: z
    .string()
    .trim()
    .regex(/^(\+?[0-9]{8,15})?$/, { error: "invalidPhone" }),
  email: z.email({ error: "invalidEmail" }).or(z.literal("")),
  address: z.string().trim().max(300),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([0-9]{2}[A-Z0-9]{13})?$/, { error: "invalidGstin" }),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const featureFlagSchema = z.object({ key: z.string().regex(/^[a-z0-9_.]+$/), enabled: z.boolean() });

export const deleteSchema = z.object({ id: uuid });

export const mediaRegisterSchema = z.object({
  path: z.string().regex(/^[a-z0-9-]+\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif)$/),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  alt: localizedSchema,
  collection: z.string().regex(/^[a-z0-9-]+$/),
});
