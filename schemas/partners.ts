import { z } from "zod";
import { localizedSchema } from "@/lib/i18n/localized";
import { GSTIN_PATTERN, phoneSchema } from "./booking";

/**
 * Partner With Us: the onboarding form (business type → details →
 * documents → agreement), its settings (`partners.defaults`), the admin
 * review actions and the vendor's own business details.
 */

export const PARTNER_BUSINESS_TYPES = [
  "hotel",
  "travel_agency",
  "restaurant",
  "transport",
  "shop",
  "pharmacy",
  "service_provider",
  "other",
] as const;
export type PartnerBusinessType = (typeof PARTNER_BUSINESS_TYPES)[number];

export const APPLICATION_STATUSES = ["submitted", "under_review", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Document kinds an applicant or vendor can upload (labels live in messages). */
export const PARTNER_DOCUMENT_KINDS = [
  "id_proof",
  "pan",
  "gst",
  "property_proof",
  "fssai",
  "drug_licence",
  "vehicle_rc",
  "trade_licence",
  "bank_proof",
  "agreement",
  "other",
] as const;
export type PartnerDocumentKind = (typeof PARTNER_DOCUMENT_KINDS)[number];

export const PARTNER_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type PartnerDocumentType = (typeof PARTNER_DOCUMENT_TYPES)[number];

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

const typeMap = <T extends z.ZodType>(value: T) => z.partialRecord(z.enum(PARTNER_BUSINESS_TYPES), value);

/** `settings` key `partners.defaults`. Public: the onboarding form reads it. */
export const partnersSettingsSchema = z.object({
  business_types: z
    .array(z.enum(PARTNER_BUSINESS_TYPES))
    .min(1)
    .default([...PARTNER_BUSINESS_TYPES]),
  /** Documents asked for per business type (others may still be added). */
  required_documents: typeMap(z.array(z.enum(PARTNER_DOCUMENT_KINDS)).max(10)).default({}),
  /** Default commission on approval, basis points (1500 = 15%). */
  commission_bps: typeMap(z.number().int().min(0).max(10000)).default({}),
  max_file_mb: z.number().int().min(1).max(20).default(8),
  agreement: z
    .object({
      version: z.string().trim().min(1).max(40),
      body: localizedSchema,
    })
    .default({ version: "1", body: { en: "Partner terms will be shared on approval.", hi: null } }),
});
export type PartnersSettings = z.output<typeof partnersSettingsSchema>;
export type PartnersSettingsInput = z.input<typeof partnersSettingsSchema>;

const optionalUpper = (pattern: RegExp, error: string) =>
  z.union([z.literal(""), z.string().trim().toUpperCase().regex(pattern, { error })]).default("");

/** One uploaded file, as step 3 of the form returns it. */
export const partnerUploadedDocSchema = z.object({
  kind: z.enum(PARTNER_DOCUMENT_KINDS),
  path: z.string().regex(/^partners\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/),
  name: z.string().trim().min(1).max(200),
  mime_type: z.enum(PARTNER_DOCUMENT_TYPES),
  size: z.number().int().positive(),
});
export type PartnerUploadedDoc = z.output<typeof partnerUploadedDocSchema>;

/** Step 3: asks for a signed upload URL for one file. */
export const partnerUploadSchema = z.object({
  mime_type: z.enum(PARTNER_DOCUMENT_TYPES, { error: "badFile" }),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024, { error: "tooLarge" }),
});

/** Steps 1–2: who the business is. */
export const partnerDetailsSchema = z.object({
  businessType: z.enum(PARTNER_BUSINESS_TYPES, { error: "required" }),
  businessName: z.string().trim().min(2, { error: "required" }).max(160),
  contactName: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  email: z.email({ error: "invalidEmail" }).max(200),
  city: z.string().trim().min(2, { error: "required" }).max(80),
  address: z.string().trim().min(5, { error: "required" }).max(500),
  gstin: optionalUpper(GSTIN_PATTERN, "invalidGstin"),
  pan: optionalUpper(PAN_PATTERN, "invalidPan"),
  website: z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((v) => v === "" || /^(https?:\/\/|@)?[\w.@/-]+$/i.test(v), { error: "invalid" }),
  /** Type-specific answers (rooms, fleet size, licence number…). */
  details: z
    .record(
      z.string().regex(/^[a-z_]{2,40}$/),
      z.union([z.string().trim().max(200), z.number().int().min(0).max(100000)]),
    )
    .default({}),
  message: z.string().trim().max(2000).default(""),
});
export type PartnerDetailsInput = z.input<typeof partnerDetailsSchema>;

/** The whole application, sent once at the end of step 4. */
export const partnerApplicationSchema = partnerDetailsSchema.extend({
  documents: z.array(partnerUploadedDocSchema).max(15).default([]),
  agreementVersion: z.string().trim().min(1).max(40),
  agreementName: z.string().trim().min(2, { error: "required" }).max(120),
  acceptAgreement: z.literal(true, { error: "acceptAgreement" }),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type PartnerApplicationInput = z.input<typeof partnerApplicationSchema>;
export type PartnerApplication = z.output<typeof partnerApplicationSchema>;

// ---------------------------------------------------------------- admin

export const applicationIdSchema = z.object({ id: z.uuid() });

export const reviewApplicationSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["under_review", "rejected"]),
    note: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.status === "rejected" && !v.note)
      ctx.addIssue({ code: "custom", path: ["note"], message: "required" });
  });

/** Approve; commission typed as % (blank = the default for the business type). */
export const approveApplicationSchema = z.object({
  id: z.uuid(),
  commissionPercent: z
    .union([z.literal(""), z.coerce.number().min(0).max(100)])
    .default("")
    .transform((v) => (v === "" ? null : Math.round(v * 100))),
});

export const vendorDocumentReviewSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "verified", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

// ---------------------------------------------------------------- vendor's own details

/** Bank or UPI details for payouts (at least one way to pay). */
export const bankDetailsSchema = z
  .object({
    holder: z.string().trim().max(120).default(""),
    account_number: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || /^[0-9]{6,18}$/.test(v), { error: "invalidAccount" }),
    ifsc: optionalUpper(IFSC_PATTERN, "invalidIfsc"),
    bank: z.string().trim().max(120).default(""),
    upi_id: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || UPI_PATTERN.test(v), { error: "invalidUpi" }),
  })
  .superRefine((v, ctx) => {
    const bank = v.account_number || v.ifsc || v.holder;
    if (bank && !(v.account_number && v.ifsc && v.holder)) {
      ctx.addIssue({
        code: "custom",
        path: [v.account_number ? (v.ifsc ? "holder" : "ifsc") : "account_number"],
        message: "required",
      });
    }
    if (!v.account_number && !v.upi_id)
      ctx.addIssue({ code: "custom", path: ["upi_id"], message: "payoutRequired" });
  });
export type BankDetailsInput = z.input<typeof bankDetailsSchema>;
export type BankDetails = z.output<typeof bankDetailsSchema>;

/** What a vendor may change about their own business from the portal. */
export const vendorProfileSchema = z.object({
  contactName: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  email: z.email({ error: "invalidEmail" }).max(200),
  address: z.string().trim().min(5, { error: "required" }).max(500),
  city: z.string().trim().min(2, { error: "required" }).max(80),
  gstin: optionalUpper(GSTIN_PATTERN, "invalidGstin"),
  pan: optionalUpper(PAN_PATTERN, "invalidPan"),
  bank: bankDetailsSchema,
});
export type VendorProfileInput = z.input<typeof vendorProfileSchema>;

/** A document a vendor adds from the portal (path issued by step 1 for that vendor). */
export const vendorUploadSchema = partnerUploadSchema.extend({ kind: z.enum(PARTNER_DOCUMENT_KINDS) });
export const vendorDocumentSchema = z.object({
  kind: z.enum(PARTNER_DOCUMENT_KINDS),
  path: z.string().regex(/^vendors\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/),
  name: z.string().trim().min(1).max(200),
  mime_type: z.enum(PARTNER_DOCUMENT_TYPES),
  size: z.number().int().positive(),
  expiresOn: z.union([z.literal(""), z.iso.date()]).default(""),
});
