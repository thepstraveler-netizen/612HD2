import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { LocalizedJson } from "@/lib/i18n/localized";
import {
  PARTNER_BUSINESS_TYPES,
  PARTNER_DOCUMENT_KINDS,
  type ApplicationStatus,
  type PartnerDocumentKind,
  type PartnersSettings,
} from "@/schemas/partners";
import type { Tone } from "@/components/admin/booking-status";
import type {
  PartnersSettingsForm,
  PartnersSettingsFormInput,
  VendorAdminForm,
  VendorAdminInput,
  VendorStatus,
} from "@/schemas/vendor-admin";
import type { Json, Tables, TablesInsert } from "@/types/database";

/**
 * Pure helpers for Admin → Vendors and Settings → Partners: form values ↔
 * rows, lenient readers for the JSON columns (documents, details, bank
 * details) and display helpers. Unit-tested.
 */

// ---------------------------------------------------------------- tones

export function applicationStatusTone(status: ApplicationStatus): Tone {
  switch (status) {
    case "submitted":
      return "warning";
    case "under_review":
      return "info";
    case "approved":
      return "success";
    default:
      return "danger";
  }
}

export function vendorStatusTone(status: VendorStatus): Tone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "danger";
}

export function documentStatusTone(status: "pending" | "verified" | "rejected"): Tone {
  if (status === "verified") return "success";
  if (status === "pending") return "warning";
  return "danger";
}

// ---------------------------------------------------------------- JSON columns

export type ApplicationDocument = {
  kind: string;
  path: string;
  name: string;
  mime_type: string;
  size: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `partner_applications.documents`, skipping malformed entries (old rows must still open). */
export function readApplicationDocuments(value: Json): ApplicationDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) => {
    if (!isRecord(d) || typeof d.path !== "string" || !d.path) return [];
    return [
      {
        kind: typeof d.kind === "string" ? d.kind : "other",
        path: d.path,
        name: typeof d.name === "string" && d.name ? d.name : "document",
        mime_type: typeof d.mime_type === "string" ? d.mime_type : "application/octet-stream",
        size: typeof d.size === "number" ? d.size : 0,
      },
    ];
  });
}

/** `partner_applications.details` as label key / text pairs (type-specific answers). */
export function readApplicationDetails(value: Json): [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, v]) =>
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? [[key, String(v)] as [string, string]]
      : [],
  );
}

/** "room_count" → "Room count" (fallback label for a detail key with no message). */
export function humanizeKey(key: string): string {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type BankDetailsView = {
  holder: string;
  account_number: string;
  ifsc: string;
  bank: string;
  upi_id: string;
};

/** `vendors.bank_details`, or null when nothing usable is stored. */
export function readBankDetails(value: Json | null): BankDetailsView | null {
  if (!isRecord(value)) return null;
  const s = (k: string) => (typeof value[k] === "string" ? (value[k] as string).trim() : "");
  const view = {
    holder: s("holder"),
    account_number: s("account_number"),
    ifsc: s("ifsc"),
    bank: s("bank"),
    upi_id: s("upi_id"),
  };
  return Object.values(view).some(Boolean) ? view : null;
}

/** "123456789012" → "••••••••9012" (only the last four digits shown). */
export function maskAccountNumber(account: string): string {
  if (account.length <= 4) return account;
  return `${"•".repeat(Math.min(account.length - 4, 8))}${account.slice(-4)}`;
}

export function isKnownDocumentKind(kind: string): kind is PartnerDocumentKind {
  return (PARTNER_DOCUMENT_KINDS as readonly string[]).includes(kind);
}

/** 1536 → "1.5 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

// ---------------------------------------------------------------- vendor form

export const NEW_VENDOR: VendorAdminInput = {
  id: "",
  kind: "other",
  name: "",
  status: "active",
  commission_percent: "10",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  gstin: "",
  pan: "",
  notes: "",
};

export function vendorFormValues(v: Tables<"vendors">): VendorAdminInput {
  return {
    id: v.id,
    kind: v.kind,
    name: v.name,
    status: v.status,
    commission_percent: bpsToPercentInput(v.commission_bps),
    contact_name: v.contact_name ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
    address: v.address ?? "",
    city: v.city ?? "",
    gstin: v.gstin ?? "",
    pan: v.pan ?? "",
    notes: v.notes ?? "",
  };
}

/** Columns staff may change (the kind is fixed once created: listings hang off it). */
export function vendorUpdateRow(form: VendorAdminForm) {
  return {
    name: form.name,
    status: form.status,
    commission_bps: percentToBps(form.commission_percent),
    contact_name: form.contact_name || null,
    phone: form.phone || null,
    email: form.email || null,
    address: form.address || null,
    city: form.city || null,
    gstin: form.gstin || null,
    pan: form.pan || null,
    notes: form.notes || null,
  } satisfies TablesInsert<"vendors">;
}

/** "Shri Krishna Dham & Sons" → "shri-krishna-dham-sons" (same rule as approval in SQL). */
export function vendorSlugBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "partner";
}

/** First free slug: base, base-2, base-3, … */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ---------------------------------------------------------------- settings: partners.defaults

export function partnersSettingsFormValues(s: PartnersSettings): PartnersSettingsFormInput {
  return {
    business_types: [...s.business_types],
    types: Object.fromEntries(
      PARTNER_BUSINESS_TYPES.map((type) => [
        type,
        {
          commission_percent: bpsToPercentInput(s.commission_bps[type] ?? 1000),
          documents: [...(s.required_documents[type] ?? [])],
        },
      ]),
    ) as PartnersSettingsFormInput["types"],
    max_file_mb: s.max_file_mb,
    agreement_version: s.agreement.version,
    agreement_body: { en: s.agreement.body.en, hi: s.agreement.body.hi ?? "" },
  };
}

export function partnersSettingsValue(form: PartnersSettingsForm): PartnersSettings {
  const required: PartnersSettings["required_documents"] = {};
  const commission: PartnersSettings["commission_bps"] = {};
  for (const type of PARTNER_BUSINESS_TYPES) {
    const block = form.types[type];
    commission[type] = percentToBps(block.commission_percent);
    if (block.documents.length) required[type] = [...new Set(block.documents)];
  }
  return {
    business_types: PARTNER_BUSINESS_TYPES.filter((t) => form.business_types.includes(t)),
    required_documents: required,
    commission_bps: commission,
    max_file_mb: form.max_file_mb,
    agreement: { version: form.agreement_version, body: form.agreement_body },
  };
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim() === (b ?? "").trim();

/**
 * Applicants accept a numbered agreement, so changed terms need a new
 * version: true when the body changed but the version did not.
 */
export function agreementNeedsNewVersion(
  stored: { version: string; body: LocalizedJson } | null,
  next: { version: string; body: LocalizedJson },
): boolean {
  if (!stored) return false;
  const changed = !sameText(stored.body.en, next.body.en) || !sameText(stored.body.hi, next.body.hi);
  return changed && stored.version.trim() === next.version.trim();
}
