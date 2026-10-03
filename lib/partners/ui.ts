import {
  PARTNER_DOCUMENT_KINDS,
  PARTNER_DOCUMENT_TYPES,
  type PartnerBusinessType,
  type PartnerDocumentKind,
  type PartnersSettings,
} from "@/schemas/partners";
import { lastCycleEnd, sumLedger, type LedgerAmounts, type LedgerTotals } from "@/lib/settlements/statement";

/**
 * Pure helpers for the Partner With Us form and the vendor portal
 * (earnings, business). Safe in the browser; unit-tested in
 * tests/unit/partners-ui.test.ts.
 */

// ---------------------------------------------------------------- onboarding form

export const PARTNER_STEPS = ["type", "details", "documents", "agreement"] as const;
export type PartnerStep = (typeof PARTNER_STEPS)[number];

/** Form fields each step validates before moving on (details are checked separately). */
export const STEP_FIELDS = {
  type: ["businessType"],
  details: ["businessName", "contactName", "phone", "email", "city", "address", "gstin", "pan", "website", "message"],
  documents: [],
  agreement: ["agreementName", "acceptAgreement"],
} as const satisfies Record<PartnerStep, readonly string[]>;

/**
 * One type-specific question. Labels live in messages under
 * `partner.detailFields.<key>`; select options under `.options.<value>`.
 */
export type DetailField =
  | { key: string; input: "number"; required: boolean; max: number }
  | { key: string; input: "text"; required: boolean; max: number }
  | { key: string; input: "select"; required: boolean; options: readonly string[] };

export const PARTNER_DETAIL_FIELDS: Record<PartnerBusinessType, readonly DetailField[]> = {
  hotel: [
    {
      key: "property_kind",
      input: "select",
      required: true,
      options: ["hotel", "resort", "guest_house", "dharamshala", "homestay"],
    },
    { key: "rooms", input: "number", required: true, max: 2000 },
    { key: "nearest_temple", input: "text", required: false, max: 120 },
  ],
  travel_agency: [
    { key: "services_offered", input: "text", required: true, max: 200 },
    { key: "years_in_business", input: "number", required: false, max: 100 },
  ],
  restaurant: [
    { key: "cuisine", input: "text", required: true, max: 120 },
    { key: "food_type", input: "select", required: true, options: ["pure_veg", "veg_egg", "veg_non_veg"] },
    { key: "seating", input: "number", required: false, max: 5000 },
    { key: "fssai_number", input: "text", required: false, max: 20 },
  ],
  transport: [
    { key: "vehicle_types", input: "text", required: true, max: 200 },
    { key: "fleet_size", input: "number", required: true, max: 10000 },
  ],
  shop: [
    { key: "shop_category", input: "text", required: true, max: 120 },
    { key: "home_delivery", input: "select", required: false, options: ["yes", "no"] },
  ],
  pharmacy: [
    { key: "drug_licence_number", input: "text", required: true, max: 40 },
    { key: "pharmacist_name", input: "text", required: false, max: 120 },
    { key: "home_delivery", input: "select", required: false, options: ["yes", "no"] },
  ],
  service_provider: [{ key: "service_category", input: "text", required: true, max: 120 }],
  other: [{ key: "what_you_offer", input: "text", required: true, max: 200 }],
};

export type DetailError = "required" | "invalidNumber" | "tooLong" | "invalid";

/** Problems with the type-specific answers, keyed by field. Empty = fine. */
export function detailErrors(
  type: PartnerBusinessType,
  details: Readonly<Record<string, string | undefined>>,
): Record<string, DetailError> {
  const errors: Record<string, DetailError> = {};
  for (const field of PARTNER_DETAIL_FIELDS[type]) {
    const value = (details[field.key] ?? "").trim();
    if (!value) {
      if (field.required) errors[field.key] = "required";
      continue;
    }
    if (field.input === "number") {
      if (!/^\d+$/.test(value) || Number(value) > field.max) errors[field.key] = "invalidNumber";
    } else if (field.input === "select") {
      if (!field.options.includes(value)) errors[field.key] = "invalid";
    } else if (value.length > field.max) {
      errors[field.key] = "tooLong";
    }
  }
  return errors;
}

/** The answers to store: only this type's questions, numbers as numbers, blanks dropped. */
export function normalizeDetails(
  type: PartnerBusinessType,
  details: Readonly<Record<string, string | undefined>>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of PARTNER_DETAIL_FIELDS[type]) {
    const value = (details[field.key] ?? "").trim();
    if (!value) continue;
    out[field.key] = field.input === "number" && /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

/** Documents asked for a business type, then every other kind (optional). */
export function documentSlots(
  settings: Pick<PartnersSettings, "required_documents">,
  type: PartnerBusinessType,
): { required: PartnerDocumentKind[]; optional: PartnerDocumentKind[] } {
  const required = [...new Set(settings.required_documents[type] ?? [])];
  const optional = PARTNER_DOCUMENT_KINDS.filter((k) => !required.includes(k) && k !== "agreement");
  return { required, optional };
}

export type FileProblem = "badFile" | "tooLarge" | null;

/** Checks a picked file before asking the server for an upload URL. */
export function checkFile(file: { type: string; size: number }, maxMb: number): FileProblem {
  if (!(PARTNER_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return "badFile";
  if (file.size <= 0) return "badFile";
  if (file.size > maxMb * 1024 * 1024) return "tooLarge";
  return null;
}

/** "1.2 MB" / "340 KB" (sizes in the uploader). */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------- vendor portal

/** The vendor the portal shows: `?v=` when it is one of the user's, else the first. */
export function pickVendorId(vendors: readonly { id: string }[], requested: string | undefined): string | null {
  if (requested && vendors.some((v) => v.id === requested)) return requested;
  return vendors[0]?.id ?? null;
}

/** A portal link keeping the chosen vendor (only when the user has more than one). */
export function vendorHref(path: string, vendorId: string | null, multiple: boolean): string {
  return multiple && vendorId ? `${path}?v=${encodeURIComponent(vendorId)}` : path;
}

/** Today's date in India, ISO (cut-offs are India days). */
export function indiaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Last day of the settlement cycle running today (the next cut-off). */
export function nextCycleEnd(today: string, cycleDays: number): string {
  const last = Date.parse(`${lastCycleEnd(today, cycleDays)}T00:00:00Z`);
  return new Date(last + cycleDays * 86_400_000).toISOString().slice(0, 10);
}

/** Totals of the ledger rows no payout has gathered yet. */
export function unsettledTotals(rows: readonly (LedgerAmounts & { payout_id: string | null })[]): LedgerTotals {
  return sumLedger(rows.filter((r) => r.payout_id === null));
}

/** Basis points as a percent label: 1500 → "15", 1250 → "12.5". */
export function bpsPercent(bps: number): string {
  const value = bps / 100;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** "12 Oct 2026" for an ISO date (`2026-10-12`) or a timestamp (India day). */
export function formatDay(value: string, locale: string): string {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(at);
}

/** Which optional money columns a statement needs (hidden when every row is zero). */
export function statementColumns(rows: readonly Pick<LedgerAmounts, "tcs_paise" | "tds_paise" | "adjustment_paise">[]): {
  tcs: boolean;
  tds: boolean;
  adjustment: boolean;
} {
  return {
    tcs: rows.some((r) => r.tcs_paise !== 0),
    tds: rows.some((r) => r.tds_paise !== 0),
    adjustment: rows.some((r) => r.adjustment_paise !== 0),
  };
}
