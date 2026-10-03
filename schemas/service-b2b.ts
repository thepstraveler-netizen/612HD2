import { z } from "zod";
import { localizedSchema, optionalLocalizedSchema } from "@/lib/i18n/localized";
import { paiseToRupeesInput } from "@/lib/money";
import type { LocalizedJson, Tables } from "@/types/database";
import { rupeesField } from "./ride-admin";

/**
 * Admin schemas for the B2B service pages (Phase 9): the plans / pricing
 * cards (`service_plans`) and the portfolio gallery (`service_portfolio`)
 * edited under CMS → Services. Prices are typed in rupees and stored as
 * integer paise (empty = "price on request"). Features are typed one per
 * line, English and Hindi side by side; line N of the Hindi box translates
 * line N of the English box. Field messages are keys under `cms.errors`.
 */

export const MAX_PLAN_FEATURES = 20;
const MAX_FEATURE_LENGTH = 200;

const uuid = z.uuid();
const sortOrder = z.coerce.number().int().min(0).max(10_000);

/** Lines of a textarea, trimmed, with trailing blank lines dropped (inner blanks keep their slot). */
function lines(text: string): string[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim());
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  return rows;
}

export type FeatureLinesProblem = "hindiWithoutEnglish" | "tooManyFeatures" | "featureTooLong";

/**
 * Two textareas (English, Hindi; one feature per line) → the localized list
 * stored in `service_plans.features`. Rows blank in both languages are
 * skipped; a Hindi line needs the English line beside it.
 */
export function parseFeatureLines(
  en: string,
  hi: string,
): { ok: true; features: LocalizedJson[] } | { ok: false; problem: FeatureLinesProblem } {
  const enRows = lines(en);
  const hiRows = lines(hi);
  const features: LocalizedJson[] = [];
  for (let i = 0; i < Math.max(enRows.length, hiRows.length); i++) {
    const e = enRows[i] ?? "";
    const h = hiRows[i] ?? "";
    if (!e && !h) continue;
    if (!e) return { ok: false, problem: "hindiWithoutEnglish" };
    if (e.length > MAX_FEATURE_LENGTH || h.length > MAX_FEATURE_LENGTH)
      return { ok: false, problem: "featureTooLong" };
    features.push({ en: e, hi: h || null });
  }
  if (features.length > MAX_PLAN_FEATURES) return { ok: false, problem: "tooManyFeatures" };
  return { ok: true, features };
}

/** The stored list back into the two textareas (a missing Hindi line stays blank to keep lines aligned). */
export function featuresToLines(features: readonly LocalizedJson[]): { en: string; hi: string } {
  const hi = features.map((f) => f.hi?.trim() ?? "");
  return {
    en: features.map((f) => f.en).join("\n"),
    hi: hi.some(Boolean) ? hi.join("\n") : "",
  };
}

// ---------------------------------------------------------------- plans

export const servicePlanFormSchema = z
  .object({
    id: uuid.optional(),
    service_id: uuid,
    name: localizedSchema,
    summary: optionalLocalizedSchema,
    /** Rupees; empty = price on request. */
    price: rupeesField,
    price_suffix: optionalLocalizedSchema,
    features_en: z.string().max(10_000),
    features_hi: z.string().max(10_000),
    is_popular: z.boolean(),
    sort_order: sortOrder,
    is_published: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    const parsed = parseFeatureLines(plan.features_en, plan.features_hi);
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        message: parsed.problem,
        path: [parsed.problem === "hindiWithoutEnglish" ? "features_hi" : "features_en"],
      });
    }
  })
  .transform(({ features_en, features_hi, price, ...rest }) => {
    const parsed = parseFeatureLines(features_en, features_hi);
    return { ...rest, price_paise: price, features: parsed.ok ? parsed.features : [] };
  });
export type ServicePlanFormInput = z.input<typeof servicePlanFormSchema>;
export type ServicePlanForm = z.output<typeof servicePlanFormSchema>;

export function servicePlanFormValues(row: Tables<"service_plans">): ServicePlanFormInput {
  const features = featuresToLines(row.features ?? []);
  return {
    id: row.id,
    service_id: row.service_id,
    name: { en: row.name.en, hi: row.name.hi ?? "" },
    summary: { en: row.summary?.en ?? "", hi: row.summary?.hi ?? "" },
    price: paiseToRupeesInput(row.price_paise),
    price_suffix: { en: row.price_suffix?.en ?? "", hi: row.price_suffix?.hi ?? "" },
    features_en: features.en,
    features_hi: features.hi,
    is_popular: row.is_popular,
    sort_order: row.sort_order,
    is_published: row.is_published,
  };
}

/** A blank plan placed after the existing ones. */
export function newServicePlanValues(
  serviceId: string,
  existing: readonly { sort_order: number }[],
): ServicePlanFormInput {
  return {
    service_id: serviceId,
    name: { en: "", hi: "" },
    summary: { en: "", hi: "" },
    price: "",
    price_suffix: { en: "", hi: "" },
    features_en: "",
    features_hi: "",
    is_popular: false,
    sort_order: nextSortOrder(existing),
    is_published: true,
  };
}

// ---------------------------------------------------------------- portfolio

/** https only, like the `service_portfolio.link_url` check. Empty → null. */
export const httpsUrlField = z
  .string()
  .trim()
  .max(500, { error: "invalidLinkUrl" })
  .refine((v) => v === "" || (/^https:\/\/[^\s/$.?#][^\s]*$/i.test(v) && URL.canParse(v)), {
    error: "invalidLinkUrl",
  })
  .transform((v) => v || null);

export const servicePortfolioFormSchema = z
  .object({
    id: uuid.optional(),
    service_id: uuid,
    media_id: uuid
      .or(z.literal(""))
      .nullish()
      .transform((v) => v || null),
    title: localizedSchema,
    caption: optionalLocalizedSchema,
    client_name: z
      .string()
      .trim()
      .max(120, { error: "invalid" })
      .transform((v) => v || null),
    link_url: httpsUrlField,
    sort_order: sortOrder,
    is_published: z.boolean(),
  })
  .refine((item) => item.media_id !== null || item.link_url !== null, {
    error: "needImageOrLink",
    path: ["link_url"],
  });
export type ServicePortfolioFormInput = z.input<typeof servicePortfolioFormSchema>;
export type ServicePortfolioForm = z.output<typeof servicePortfolioFormSchema>;

export function servicePortfolioFormValues(row: Tables<"service_portfolio">): ServicePortfolioFormInput {
  return {
    id: row.id,
    service_id: row.service_id,
    media_id: row.media_id,
    title: { en: row.title.en, hi: row.title.hi ?? "" },
    caption: { en: row.caption?.en ?? "", hi: row.caption?.hi ?? "" },
    client_name: row.client_name ?? "",
    link_url: row.link_url ?? "",
    sort_order: row.sort_order,
    is_published: row.is_published,
  };
}

export function newServicePortfolioValues(
  serviceId: string,
  existing: readonly { sort_order: number }[],
): ServicePortfolioFormInput {
  return {
    service_id: serviceId,
    media_id: null,
    title: { en: "", hi: "" },
    caption: { en: "", hi: "" },
    client_name: "",
    link_url: "",
    sort_order: nextSortOrder(existing),
    is_published: true,
  };
}

// ---------------------------------------------------------------- shared

export const serviceB2bIdSchema = z.object({ id: uuid });

/** Next free slot in steps of 10, so editors can slot a row in between later. */
export function nextSortOrder(existing: readonly { sort_order: number }[]): number {
  const max = existing.reduce((m, r) => Math.max(m, r.sort_order), 0);
  return Math.min(10_000, existing.length ? max + 10 : 10);
}
