import "server-only";
import { getVendorContext, type VendorContext } from "@/lib/delivery/vendor";
import { hasServiceRole } from "@/lib/env.server";
import { payoutReference, type StatementRow } from "@/lib/settlements/statement";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { bankDetailsSchema, type BankDetailsInput } from "@/schemas/partners";
import type { PayoutMethod, PayoutStatus } from "@/schemas/settlements";
import type { Enums } from "@/types/database";
import { pickVendorId } from "./ui";

/**
 * Vendor portal reads beyond the delivery screens: which vendor the page
 * shows (`?v=`), its business details, documents, ledger and payouts.
 * Rows are read with the signed-in client, so RLS (vendor members only)
 * decides access. Two things need the service role, always after the
 * membership check RLS has just done: signed links to private documents,
 * and booking codes for ledger rows of bookings whose own vendor column
 * names someone else (a cab on a partner's vehicle).
 */

export type PortalVendor = {
  id: string;
  name: string;
  kind: Enums<"vendor_kind">;
  status: Enums<"vendor_status">;
  commissionBps: number;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  gstin: string;
  pan: string;
  bank: BankDetailsInput;
  agreementVersion: string | null;
  agreementAcceptedAt: string | null;
};

export type PortalContext = {
  ctx: VendorContext;
  vendors: { id: string; name: string }[];
  vendor: PortalVendor;
  /** The chosen vendor has stores (food, grocery, pharmacy). */
  hasStores: boolean;
};

const EMPTY_BANK: BankDetailsInput = { holder: "", account_number: "", ifsc: "", bank: "", upi_id: "" };

function readBank(value: unknown): BankDetailsInput {
  if (!value || typeof value !== "object") return EMPTY_BANK;
  // Lenient: show whatever is stored; the form validates on save.
  const raw = value as Record<string, unknown>;
  const text = (k: keyof BankDetailsInput) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const parsed = bankDetailsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    holder: text("holder"),
    account_number: text("account_number"),
    ifsc: text("ifsc"),
    bank: text("bank"),
    upi_id: text("upi_id"),
  };
}

/** The vendor a portal page shows, or null when the user belongs to none. */
export async function getPortalContext(requested: string | undefined): Promise<PortalContext | null> {
  const ctx = await getVendorContext();
  if (!ctx || ctx.vendors.length === 0) return null;
  const id = pickVendorId(ctx.vendors, requested);
  if (!id) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select(
      "id, name, kind, status, commission_bps, contact_name, phone, email, address, city, gstin, pan, bank_details, agreement_version, agreement_accepted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`[vendor portal] vendor: ${error.message}`);
  if (!data) return null;
  return {
    ctx,
    vendors: ctx.vendors,
    hasStores: ctx.stores.some((s) => s.vendorId === id),
    vendor: {
      id: data.id,
      name: data.name,
      kind: data.kind,
      status: data.status,
      commissionBps: data.commission_bps,
      contactName: data.contact_name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      gstin: data.gstin ?? "",
      pan: data.pan ?? "",
      bank: readBank(data.bank_details),
      agreementVersion: data.agreement_version,
      agreementAcceptedAt: data.agreement_accepted_at,
    },
  };
}

export type LedgerRow = StatementRow & {
  id: string;
  payout_id: string | null;
};

export type PayoutRow = {
  id: string;
  reference: string;
  periodEnd: string;
  entries: number;
  amountPaise: number;
  status: PayoutStatus;
  paidAt: string | null;
  method: PayoutMethod | null;
  paymentReference: string | null;
};

export type VendorEarnings = { ledger: LedgerRow[]; payouts: PayoutRow[] };

const LEDGER_LIMIT = 500;

/** The vendor's ledger (newest first, up to 500 rows) and payouts, read under RLS. */
export async function getVendorEarnings(vendorId: string): Promise<VendorEarnings> {
  const supabase = await createClient();
  const [ledger, payouts] = await Promise.all([
    supabase
      .from("vendor_ledger_entries")
      .select(
        "id, booking_id, kind, entry_date, gross_paise, platform_collected_paise, vendor_collected_paise, commission_paise, commission_tax_paise, tcs_paise, tds_paise, adjustment_paise, net_paise, note, payout_id, created_at",
      )
      .eq("vendor_id", vendorId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LEDGER_LIMIT),
    supabase
      .from("vendor_payouts")
      .select("id, number, period_end, entries_count, amount_paise, status, paid_at, method, reference")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (ledger.error) throw new Error(`[vendor portal] ledger: ${ledger.error.message}`);
  if (payouts.error) throw new Error(`[vendor portal] payouts: ${payouts.error.message}`);

  const payoutRefs = new Map(payouts.data.map((p) => [p.id, payoutReference(p.number)]));
  const bookingIds = [...new Set(ledger.data.flatMap((r) => (r.booking_id ? [r.booking_id] : [])))];
  const codes = await bookingCodes(bookingIds);

  return {
    ledger: ledger.data.map((r) => ({
      id: r.id,
      payout_id: r.payout_id,
      entry_date: r.entry_date,
      booking_code: r.booking_id ? (codes.get(r.booking_id) ?? null) : null,
      kind: r.kind,
      payout_reference: r.payout_id ? (payoutRefs.get(r.payout_id) ?? null) : null,
      note: r.note,
      gross_paise: r.gross_paise,
      platform_collected_paise: r.platform_collected_paise,
      vendor_collected_paise: r.vendor_collected_paise,
      commission_paise: r.commission_paise,
      commission_tax_paise: r.commission_tax_paise,
      tcs_paise: r.tcs_paise,
      tds_paise: r.tds_paise,
      adjustment_paise: r.adjustment_paise,
      net_paise: r.net_paise,
    })),
    payouts: payouts.data.map((p) => ({
      id: p.id,
      reference: payoutReference(p.number),
      periodEnd: p.period_end,
      entries: p.entries_count,
      amountPaise: p.amount_paise,
      status: p.status,
      paidAt: p.paid_at,
      method: p.method,
      paymentReference: p.reference,
    })),
  };
}

/**
 * Booking codes for ledger rows the caller has already read under RLS
 * (so they belong to the vendor). Only the code is read.
 */
async function bookingCodes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const client = hasServiceRole() ? createAdminClient() : await createClient();
  const { data, error } = await client.from("bookings").select("id, code").in("id", ids);
  if (error) {
    console.error("[vendor portal] booking codes", error);
    return new Map();
  }
  return new Map(data.map((b) => [b.id, b.code]));
}

export type VendorDocumentRow = {
  id: string;
  kind: string;
  fileName: string;
  status: Enums<"vendor_document_status">;
  note: string | null;
  expiresOn: string | null;
  createdAt: string;
  url: string | null;
};

/** The vendor's documents with short-lived signed links (10 minutes). */
export async function getVendorDocuments(vendorId: string): Promise<VendorDocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_documents")
    .select("id, kind, file_path, file_name, status, note, expires_on, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`[vendor portal] documents: ${error.message}`);
  if (data.length === 0) return [];
  const urls = new Map<string, string>();
  if (hasServiceRole()) {
    const { data: signed, error: signError } = await createAdminClient()
      .storage.from("documents")
      .createSignedUrls(
        data.map((d) => d.file_path),
        600,
      );
    if (signError) console.error("[vendor portal] signed urls", signError);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return data.map((d) => ({
    id: d.id,
    kind: d.kind,
    fileName: d.file_name,
    status: d.status,
    note: d.note,
    expiresOn: d.expires_on,
    createdAt: d.created_at,
    url: urls.get(d.file_path) ?? null,
  }));
}
