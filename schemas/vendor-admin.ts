import { z } from "zod";
import { localizedSchema } from "@/lib/i18n/localized";
import { GSTIN_PATTERN, normalizePhone } from "./booking";
import {
  APPLICATION_STATUSES,
  PAN_PATTERN,
  PARTNER_BUSINESS_TYPES,
  PARTNER_DOCUMENT_KINDS,
} from "./partners";
import { percentField } from "./ride-admin";

/**
 * Admin → Vendors: the vendor edit / create form, the list filters and the
 * Settings → Partners & settlements forms (`partners.defaults`,
 * `settlements.defaults`). Field messages are keys under `cms.errors`
 * (shared form fields translate them); commission and tax rates are typed
 * as % and leave the row mappers as basis points.
 */

export const VENDOR_KINDS = [
  "hotel",
  "restaurant",
  "store",
  "transport",
  "pharmacy",
  "agency",
  "other",
] as const;
export type VendorKind = (typeof VENDOR_KINDS)[number];

export const VENDOR_STATUSES = ["pending", "active", "suspended"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

const trimmed = (max: number) => z.string().trim().max(max, { error: "invalid" });

/** A whole number typed into a form field, with a translatable message. */
const wholeNumber = (min: number, max: number) =>
  z.coerce
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .min(min, { error: "invalid" })
    .max(max, { error: "invalid" });

const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return "";
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return phone;
  });

const optionalEmail = z.union([
  z.literal(""),
  z.email({ error: "invalidEmail" }).max(200, { error: "invalidEmail" }),
]);

const optionalUpper = (pattern: RegExp, error: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || pattern.test(v), { error });

/** Staff edit (or create, without `id`) of a vendor. Bank details stay with the vendor. */
export const vendorAdminSchema = z.object({
  id: z.uuid().or(z.literal("")).default(""),
  kind: z.enum(VENDOR_KINDS),
  name: z.string().trim().min(2, { error: "required" }).max(160, { error: "invalid" }),
  status: z.enum(VENDOR_STATUSES),
  commission_percent: percentField(100),
  contact_name: trimmed(120),
  phone: optionalPhone,
  email: optionalEmail,
  address: trimmed(500),
  city: trimmed(80),
  gstin: optionalUpper(GSTIN_PATTERN, "invalidGstin"),
  pan: optionalUpper(PAN_PATTERN, "invalidPan"),
  notes: trimmed(2000),
});
export type VendorAdminInput = z.input<typeof vendorAdminSchema>;
export type VendorAdminForm = z.output<typeof vendorAdminSchema>;

// ---------------------------------------------------------------- list filters

/** Applications queue: `open` (submitted + under review, the default) or one status, or all. */
export const applicationFiltersSchema = z.object({
  status: z
    .enum(["open", "all", ...APPLICATION_STATUSES])
    .catch("open")
    .default("open"),
  q: z.string().trim().max(80).optional().catch(undefined),
});
export type ApplicationFilters = z.output<typeof applicationFiltersSchema>;

export const vendorFiltersSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  kind: z.enum(VENDOR_KINDS).optional().catch(undefined),
  status: z.enum(VENDOR_STATUSES).optional().catch(undefined),
});
export type VendorFilters = z.output<typeof vendorFiltersSchema>;

// ---------------------------------------------------------------- settings forms

const typeSettings = z.object({
  commission_percent: percentField(100),
  documents: z.array(z.enum(PARTNER_DOCUMENT_KINDS)).max(10, { error: "invalid" }),
});

/** Settings → Partners: `partners.defaults`, one block per business type. */
export const partnersSettingsFormSchema = z.object({
  business_types: z.array(z.enum(PARTNER_BUSINESS_TYPES)).min(1, { error: "required" }),
  types: z.object(
    Object.fromEntries(PARTNER_BUSINESS_TYPES.map((type) => [type, typeSettings])) as Record<
      (typeof PARTNER_BUSINESS_TYPES)[number],
      typeof typeSettings
    >,
  ),
  max_file_mb: wholeNumber(1, 20),
  agreement_version: z.string().trim().min(1, { error: "required" }).max(40, { error: "invalid" }),
  agreement_body: localizedSchema,
});
export type PartnersSettingsFormInput = z.input<typeof partnersSettingsFormSchema>;
export type PartnersSettingsForm = z.output<typeof partnersSettingsFormSchema>;

/** Settings → Settlements: `settlements.defaults` (the provider is shown, not edited). */
export const settlementsSettingsFormSchema = z.object({
  commission_tax_percent: percentField(28),
  tcs_percent: percentField(10),
  tds_percent: percentField(10),
  cycle_days: wholeNumber(1, 60),
});
export type SettlementsSettingsFormInput = z.input<typeof settlementsSettingsFormSchema>;
export type SettlementsSettingsForm = z.output<typeof settlementsSettingsFormSchema>;

// ---------------------------------------------------------------- settlement screens

const optionalDate = z.iso.date().optional().catch(undefined);

/** A vendor's ledger page and CSV (URL search params). */
export const ledgerFiltersSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  view: z.enum(["all", "unsettled", "settled"]).catch("all").default("all"),
});
export type LedgerFilters = z.output<typeof ledgerFiltersSchema>;

/** Commission report range: both ends required, defaults filled by the page. */
export const reportRangeSchema = z.object({ from: optionalDate, to: optionalDate });
