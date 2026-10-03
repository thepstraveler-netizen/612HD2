/**
 * Pure helpers for settlement statements (admin and vendor screens, CSV).
 * Ledger rows come from `vendor_ledger_entries`; the database computes
 * every amount, these only add them up and label them.
 */

export type LedgerAmounts = {
  gross_paise: number;
  platform_collected_paise: number;
  vendor_collected_paise: number;
  commission_paise: number;
  commission_tax_paise: number;
  tcs_paise: number;
  tds_paise: number;
  adjustment_paise: number;
  net_paise: number;
};

export type LedgerTotals = LedgerAmounts & { count: number };

const ZERO: LedgerTotals = {
  count: 0,
  gross_paise: 0,
  platform_collected_paise: 0,
  vendor_collected_paise: 0,
  commission_paise: 0,
  commission_tax_paise: 0,
  tcs_paise: 0,
  tds_paise: 0,
  adjustment_paise: 0,
  net_paise: 0,
};

export function sumLedger(rows: readonly LedgerAmounts[]): LedgerTotals {
  return rows.reduce<LedgerTotals>(
    (t, r) => ({
      count: t.count + 1,
      gross_paise: t.gross_paise + r.gross_paise,
      platform_collected_paise: t.platform_collected_paise + r.platform_collected_paise,
      vendor_collected_paise: t.vendor_collected_paise + r.vendor_collected_paise,
      commission_paise: t.commission_paise + r.commission_paise,
      commission_tax_paise: t.commission_tax_paise + r.commission_tax_paise,
      tcs_paise: t.tcs_paise + r.tcs_paise,
      tds_paise: t.tds_paise + r.tds_paise,
      adjustment_paise: t.adjustment_paise + r.adjustment_paise,
      net_paise: t.net_paise + r.net_paise,
    }),
    ZERO,
  );
}

/** Who owes whom for a net amount: positive = the platform pays the vendor. */
export function balanceDirection(netPaise: number): "pay_vendor" | "collect" | "settled" {
  if (netPaise > 0) return "pay_vendor";
  if (netPaise < 0) return "collect";
  return "settled";
}

/** "PO-00012" */
export function payoutReference(number: number): string {
  return `PO-${String(number).padStart(5, "0")}`;
}

/**
 * Last day of the most recent settlement cycle that has fully ended before
 * `today` (an ISO date). Cycles are `cycleDays` long, counted from
 * 2026-01-01, so every vendor shares the same cut-off days.
 */
export function lastCycleEnd(today: string, cycleDays: number): string {
  const day = 86_400_000;
  const epoch = Date.UTC(2026, 0, 1);
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - epoch) / day);
  const end = epoch + (Math.floor(days / cycleDays) * cycleDays - 1) * day;
  return new Date(end).toISOString().slice(0, 10);
}

const CSV_HEADER = [
  "date",
  "booking",
  "kind",
  "gross",
  "collected_by_platform",
  "collected_by_vendor",
  "commission",
  "gst_on_commission",
  "tcs",
  "tds",
  "adjustment",
  "net",
  "payout",
  "note",
];

export type StatementRow = LedgerAmounts & {
  entry_date: string;
  booking_code: string | null;
  kind: string;
  payout_reference: string | null;
  note: string | null;
};

function cell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** A ledger statement as CSV (amounts in rupees). */
export function statementCsv(rows: readonly StatementRow[]): string {
  const lines = rows.map((r) =>
    [
      r.entry_date,
      r.booking_code,
      r.kind,
      rupees(r.gross_paise),
      rupees(r.platform_collected_paise),
      rupees(r.vendor_collected_paise),
      rupees(r.commission_paise),
      rupees(r.commission_tax_paise),
      rupees(r.tcs_paise),
      rupees(r.tds_paise),
      rupees(r.adjustment_paise),
      rupees(r.net_paise),
      r.payout_reference,
      r.note,
    ]
      .map(cell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\n");
}
