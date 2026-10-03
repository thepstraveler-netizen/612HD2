import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readBankDetails, type BankDetailsView } from "@/lib/partners/admin-rows";
import type { SettlementFilters } from "@/schemas/settlements";
import type { Tables } from "@/types/database";
import { commissionReport, summariseUnsettled, type ReportRow, type UnsettledSummary } from "./admin-rows";
import { payoutReference, sumLedger, type LedgerTotals, type StatementRow } from "./statement";

/**
 * Admin reads for Payments → Settlements. Ledger rows and payouts are read
 * as the signed-in user (RLS: payments.read). Finance staff need not hold
 * vendors.read or bookings.read, so vendor names / payout details and
 * booking codes are looked up with the service role, after
 * {@link assertPermission} for payments.read; only those fields leave.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[settlements admin] ${scope}: ${error.message}`);
}

const PAGE = 1000;
const IN_CHUNK = 150;
export const PAYOUTS_PER_PAGE = 50;

/** Reads every page of a PostgREST query (ledgers can pass the 1000-row cap). */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  scope: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(scope, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type VendorPayoutInfo = Pick<Tables<"vendors">, "id" | "name" | "kind" | "status" | "phone" | "email"> & {
  bank: BankDetailsView | null;
};

/** Vendor names and payout details, keyed by id. */
export async function vendorInfo(ids: string[]): Promise<Map<string, VendorPayoutInfo>> {
  const wanted = [...new Set(ids)];
  const out = new Map<string, VendorPayoutInfo>();
  if (!wanted.length) return out;
  await assertPermission("payments.read");
  const admin = createAdminClient();
  for (let i = 0; i < wanted.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from("vendors")
      .select("id, name, kind, status, phone, email, bank_details")
      .in("id", wanted.slice(i, i + IN_CHUNK));
    if (error) fail("vendors", error);
    for (const { bank_details, ...v } of data) out.set(v.id, { ...v, bank: readBankDetails(bank_details) });
  }
  return out;
}

/** All vendors (id + name) for filters and pickers. */
export async function vendorOptions(): Promise<{ id: string; name: string }[]> {
  await assertPermission("payments.read");
  const { data, error } = await createAdminClient()
    .from("vendors")
    .select("id, name")
    .is("deleted_at", null)
    .order("name")
    .limit(2000);
  if (error) fail("vendor options", error);
  return data;
}

async function bookingCodes(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  await assertPermission("payments.read");
  const admin = createAdminClient();
  for (let i = 0; i < wanted.length; i += IN_CHUNK) {
    const { data, error } = await admin.from("bookings").select("id, code").in("id", wanted.slice(i, i + IN_CHUNK));
    if (error) fail("bookings", error);
    for (const b of data) out.set(b.id, b.code);
  }
  return out;
}

async function payoutNumbers(ids: (string | null)[]): Promise<Map<string, number>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, number>();
  if (!wanted.length) return out;
  const supabase = await createClient();
  for (let i = 0; i < wanted.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("vendor_payouts")
      .select("id, number")
      .in("id", wanted.slice(i, i + IN_CHUNK));
    if (error) fail("payout numbers", error);
    for (const p of data) out.set(p.id, p.number);
  }
  return out;
}

// ---------------------------------------------------------------- overview

export type OverviewRow = UnsettledSummary & {
  vendor: VendorPayoutInfo | null;
  pending: Pick<Tables<"vendor_payouts">, "id" | "number" | "amount_paise" | "period_end"> | null;
};

/** One row per vendor with unsettled ledger rows or a payout waiting to be paid. */
export async function settlementOverview(): Promise<OverviewRow[]> {
  const supabase = await createClient();
  const [unsettled, pending] = await Promise.all([
    readAll(
      (from, to) =>
        supabase
          .from("vendor_ledger_entries")
          .select("vendor_id, entry_date, net_paise")
          .is("payout_id", null)
          .order("entry_date")
          .order("id")
          .range(from, to),
      "unsettled",
    ),
    supabase
      .from("vendor_payouts")
      .select("id, number, vendor_id, amount_paise, period_end")
      .eq("status", "pending"),
  ]);
  if (pending.error) fail("pending payouts", pending.error);
  const summaries = summariseUnsettled(unsettled);
  const pendingByVendor = new Map(pending.data.map((p) => [p.vendor_id, p]));
  for (const p of pending.data) {
    if (!summaries.some((s) => s.vendorId === p.vendor_id)) {
      summaries.push({ vendorId: p.vendor_id, count: 0, netPaise: 0, oldest: "" });
    }
  }
  const vendors = await vendorInfo(summaries.map((s) => s.vendorId));
  return summaries.map((s) => ({
    ...s,
    vendor: vendors.get(s.vendorId) ?? null,
    pending: pendingByVendor.get(s.vendorId) ?? null,
  }));
}

// ---------------------------------------------------------------- ledger

export type LedgerView = "all" | "unsettled" | "settled";

export type LedgerRow = Tables<"vendor_ledger_entries"> & {
  bookingCode: string | null;
  payoutNumber: number | null;
};

export type VendorLedger = {
  vendor: VendorPayoutInfo;
  rows: LedgerRow[];
  totals: LedgerTotals;
  /** Every unsettled row (ignores the filters): what the next payout would settle. */
  unsettled: LedgerTotals;
  pending: Pick<Tables<"vendor_payouts">, "id" | "number" | "amount_paise" | "period_end"> | null;
};

export async function getVendorLedger(
  vendorId: string,
  filters: { from?: string; to?: string; view: LedgerView },
): Promise<VendorLedger | null> {
  const vendor = (await vendorInfo([vendorId])).get(vendorId);
  if (!vendor) return null;
  const supabase = await createClient();
  const [rows, open, pending] = await Promise.all([
    readAll((from, to) => {
      let q = supabase
        .from("vendor_ledger_entries")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (filters.from) q = q.gte("entry_date", filters.from);
      if (filters.to) q = q.lte("entry_date", filters.to);
      if (filters.view === "unsettled") q = q.is("payout_id", null);
      if (filters.view === "settled") q = q.not("payout_id", "is", null);
      return q;
    }, "ledger"),
    readAll(
      (from, to) =>
        supabase
          .from("vendor_ledger_entries")
          .select(
            "gross_paise, platform_collected_paise, vendor_collected_paise, commission_paise, commission_tax_paise, tcs_paise, tds_paise, adjustment_paise, net_paise",
          )
          .eq("vendor_id", vendorId)
          .is("payout_id", null)
          .order("id")
          .range(from, to),
      "unsettled",
    ),
    supabase
      .from("vendor_payouts")
      .select("id, number, amount_paise, period_end")
      .eq("vendor_id", vendorId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);
  if (pending.error) fail("pending payout", pending.error);
  const [codes, numbers] = await Promise.all([
    bookingCodes(rows.map((r) => r.booking_id)),
    payoutNumbers(rows.map((r) => r.payout_id)),
  ]);
  return {
    vendor,
    rows: rows.map((r) => ({
      ...r,
      bookingCode: r.booking_id ? (codes.get(r.booking_id) ?? null) : null,
      payoutNumber: r.payout_id ? (numbers.get(r.payout_id) ?? null) : null,
    })),
    totals: sumLedger(rows),
    unsettled: sumLedger(open),
    pending: pending.data,
  };
}

/** Ledger rows → the CSV statement shape. */
export function toStatementRows(rows: LedgerRow[]): StatementRow[] {
  return rows.map((r) => ({
    ...r,
    booking_code: r.bookingCode,
    payout_reference: r.payoutNumber === null ? null : payoutReference(r.payoutNumber),
  }));
}

// ---------------------------------------------------------------- payouts

export type PayoutListRow = Tables<"vendor_payouts"> & { vendorName: string };

export async function listPayouts(
  filters: Pick<SettlementFilters, "status" | "vendor" | "page">,
): Promise<{ rows: PayoutListRow[]; total: number }> {
  const supabase = await createClient();
  const start = (filters.page - 1) * PAYOUTS_PER_PAGE;
  let query = supabase
    .from("vendor_payouts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(start, start + PAYOUTS_PER_PAGE - 1);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.vendor) query = query.eq("vendor_id", filters.vendor);
  const { data, error, count } = await query;
  if (error) fail("payouts", error);
  const vendors = await vendorInfo(data.map((p) => p.vendor_id));
  return {
    rows: data.map((p) => ({ ...p, vendorName: vendors.get(p.vendor_id)?.name ?? "—" })),
    total: count ?? data.length,
  };
}

export type AdminPayout = {
  payout: Tables<"vendor_payouts">;
  vendor: VendorPayoutInfo | null;
  rows: LedgerRow[];
  totals: LedgerTotals;
  people: Map<string, string>;
};

export async function getPayout(id: string): Promise<AdminPayout | null> {
  const supabase = await createClient();
  const { data: payout, error } = await supabase.from("vendor_payouts").select("*").eq("id", id).maybeSingle();
  if (error) fail("payout", error);
  if (!payout) return null;
  const rows = await readAll(
    (from, to) =>
      supabase
        .from("vendor_ledger_entries")
        .select("*")
        .eq("payout_id", id)
        .order("entry_date")
        .order("created_at")
        .range(from, to),
    "payout rows",
  );
  const actorIds = [payout.created_by, payout.paid_by].filter((v): v is string => Boolean(v));
  const [vendors, codes, people] = await Promise.all([
    vendorInfo([payout.vendor_id]),
    bookingCodes(rows.map((r) => r.booking_id)),
    staffNames(actorIds),
  ]);
  return {
    payout,
    vendor: vendors.get(payout.vendor_id) ?? null,
    rows: rows.map((r) => ({
      ...r,
      bookingCode: r.booking_id ? (codes.get(r.booking_id) ?? null) : null,
      payoutNumber: payout.number,
    })),
    totals: sumLedger(rows),
    people,
  };
}

async function staffNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  await assertPermission("payments.read");
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...new Set(ids)]);
  if (error) fail("profiles", error);
  for (const p of data) out.set(p.id, p.full_name ?? p.email ?? p.id);
  return out;
}

// ---------------------------------------------------------------- commission report

/** Every ledger row dated in [from, to], totalled per vendor (settled or not). */
export async function getCommissionReport(
  from: string,
  to: string,
): Promise<{ rows: ReportRow[]; totals: LedgerTotals }> {
  const supabase = await createClient();
  const rows = await readAll(
    (start, end) =>
      supabase
        .from("vendor_ledger_entries")
        .select(
          "vendor_id, gross_paise, platform_collected_paise, vendor_collected_paise, commission_paise, commission_tax_paise, tcs_paise, tds_paise, adjustment_paise, net_paise",
        )
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("id")
        .range(start, end),
    "report",
  );
  const vendors = await vendorInfo(rows.map((r) => r.vendor_id));
  return commissionReport(rows, new Map([...vendors].map(([id, v]) => [id, v.name])));
}
