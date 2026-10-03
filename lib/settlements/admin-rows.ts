import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { Tone } from "@/components/admin/booking-status";
import type { PayoutStatus, SettlementsSettings } from "@/schemas/settlements";
import type {
  LedgerFilters,
  SettlementsSettingsForm,
  SettlementsSettingsFormInput,
} from "@/schemas/vendor-admin";
import { sumLedger, type LedgerAmounts, type LedgerTotals } from "./statement";

/**
 * Pure helpers for Admin → Payments → Settlements: the unsettled overview,
 * the commission report and its CSV, and the settings form mapping.
 */

export function payoutStatusTone(status: PayoutStatus): Tone {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  return "muted";
}

export type UnsettledSummary = {
  vendorId: string;
  count: number;
  netPaise: number;
  oldest: string;
};

/** Unsettled ledger rows grouped per vendor, largest balance (either way) first. */
export function summariseUnsettled(
  rows: readonly { vendor_id: string; entry_date: string; net_paise: number }[],
): UnsettledSummary[] {
  const byVendor = new Map<string, UnsettledSummary>();
  for (const r of rows) {
    const s = byVendor.get(r.vendor_id);
    if (!s) {
      byVendor.set(r.vendor_id, {
        vendorId: r.vendor_id,
        count: 1,
        netPaise: r.net_paise,
        oldest: r.entry_date,
      });
    } else {
      s.count += 1;
      s.netPaise += r.net_paise;
      if (r.entry_date < s.oldest) s.oldest = r.entry_date;
    }
  }
  return [...byVendor.values()].sort(
    (a, b) => Math.abs(b.netPaise) - Math.abs(a.netPaise) || a.oldest.localeCompare(b.oldest),
  );
}

export type ReportRow = LedgerTotals & { vendorId: string; vendorName: string };

/** Commission report: ledger rows in a range, totalled per vendor (by name), plus the grand total. */
export function commissionReport(
  rows: readonly (LedgerAmounts & { vendor_id: string })[],
  vendorNames: ReadonlyMap<string, string>,
): { rows: ReportRow[]; totals: LedgerTotals } {
  const groups = new Map<string, LedgerAmounts[]>();
  for (const r of rows) {
    const list = groups.get(r.vendor_id);
    if (list) list.push(r);
    else groups.set(r.vendor_id, [r]);
  }
  const out = [...groups.entries()]
    .map(([vendorId, list]) => ({
      vendorId,
      vendorName: vendorNames.get(vendorId) ?? vendorId,
      ...sumLedger(list),
    }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  return { rows: out, totals: sumLedger(rows) };
}

function cell(value: string | number): string {
  let s = String(value);
  // Spreadsheet formula injection: a text cell must not start with = + - @.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** The commission report as CSV (amounts in rupees). */
export function commissionReportCsv(report: { rows: ReportRow[]; totals: LedgerTotals }): string {
  const header = [
    "vendor",
    "entries",
    "gross",
    "collected_by_platform",
    "collected_by_vendor",
    "commission",
    "gst_on_commission",
    "tcs",
    "tds",
    "adjustment",
    "net",
  ];
  const line = (name: string, t: LedgerTotals) =>
    [
      cell(name),
      t.count,
      rupees(t.gross_paise),
      rupees(t.platform_collected_paise),
      rupees(t.vendor_collected_paise),
      rupees(t.commission_paise),
      rupees(t.commission_tax_paise),
      rupees(t.tcs_paise),
      rupees(t.tds_paise),
      rupees(t.adjustment_paise),
      rupees(t.net_paise),
    ].join(",");
  return [
    header.join(","),
    ...report.rows.map((r) => line(r.vendorName, r)),
    line("TOTAL", report.totals),
  ].join("\n");
}

/** A name → a fragment safe in a download file name ("Shri Dham" → "shri-dham"). */
export function fileSafe(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "vendor"
  );
}

// ---------------------------------------------------------------- settings

export function settlementsSettingsFormValues(s: SettlementsSettings): SettlementsSettingsFormInput {
  return {
    commission_tax_percent: bpsToPercentInput(s.commission_tax_bps),
    tcs_percent: bpsToPercentInput(s.tcs_bps),
    tds_percent: bpsToPercentInput(s.tds_bps),
    cycle_days: s.cycle_days,
  };
}

/** The provider is kept as stored: only "manual" exists and it is not edited here. */
export function settlementsSettingsValue(
  form: SettlementsSettingsForm,
  provider: string,
): SettlementsSettings {
  return {
    commission_tax_bps: percentToBps(form.commission_tax_percent),
    tcs_bps: percentToBps(form.tcs_percent),
    tds_bps: percentToBps(form.tds_percent),
    cycle_days: form.cycle_days,
    provider,
  };
}

// ---------------------------------------------------------------- filters

/** Query string for a vendor's ledger CSV with the page's filters. */
export function ledgerQueryString(vendorId: string, filters: LedgerFilters): string {
  const params = new URLSearchParams({ vendor: vendorId });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.view !== "all") params.set("view", filters.view);
  return params.toString();
}

/** Default report range: the first of last month to today (India dates). */
export function defaultReportRange(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return { from: `${prev.y}-${String(prev.m).padStart(2, "0")}-01`, to: today };
}
