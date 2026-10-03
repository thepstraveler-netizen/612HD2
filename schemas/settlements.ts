import { z } from "zod";

/**
 * Vendor settlements: settings (`settlements.defaults`), payouts and manual
 * ledger adjustments. Amounts are typed in rupees and leave as paise.
 */

export const PAYOUT_STATUSES = ["pending", "paid", "cancelled"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_METHODS = ["bank_transfer", "upi", "cash", "cheque", "adjusted", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const LEDGER_KINDS = ["booking", "adjustment", "manual"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** `settings` key `settlements.defaults` (staff only). */
export const settlementsSettingsSchema = z.object({
  /** GST charged on the platform's commission, basis points (1800 = 18%). */
  commission_tax_bps: z.number().int().min(0).max(2800).default(1800),
  /** TCS / TDS withheld on gross value, basis points; 0 = not withheld. Set with your CA. */
  tcs_bps: z.number().int().min(0).max(1000).default(0),
  tds_bps: z.number().int().min(0).max(1000).default(0),
  /** Settlement cycle shown to vendors. */
  cycle_days: z.number().int().min(1).max(60).default(7),
  /** Payout adapter (lib/settlements/provider.ts); only "manual" is implemented. */
  provider: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .default("manual"),
});
export type SettlementsSettings = z.output<typeof settlementsSettingsSchema>;
export type SettlementsSettingsInput = z.input<typeof settlementsSettingsSchema>;

const isoDate = z.iso.date({ error: "invalidDate" });

export const createPayoutSchema = z.object({ vendorId: z.uuid(), periodEnd: isoDate });

export const payoutIdSchema = z.object({ id: z.uuid() });

export const markPayoutPaidSchema = z.object({
  id: z.uuid(),
  method: z.enum(PAYOUT_METHODS),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
});
export type MarkPayoutPaidInput = z.input<typeof markPayoutPaidSchema>;

/** A manual credit (vendor gets more) or debit (vendor owes) in rupees. */
export const adjustmentSchema = z.object({
  vendorId: z.uuid(),
  direction: z.enum(["credit", "debit"]),
  amount: z.coerce
    .number({ error: "invalid" })
    .min(0.01, { error: "invalid" })
    .max(10_000_000, { error: "invalid" })
    .transform((v) => Math.round(v * 100)),
  note: z.string().trim().min(3, { error: "required" }).max(500),
});
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

/** Settlement screens and the commission report (URL search params). */
export const settlementFiltersSchema = z.object({
  vendor: z.uuid().optional().catch(undefined),
  status: z.enum(PAYOUT_STATUSES).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type SettlementFilters = z.output<typeof settlementFiltersSchema>;
