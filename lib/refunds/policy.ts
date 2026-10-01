import type { CancellationRule } from "@/lib/availability/engine";

/**
 * How much of a cancelled booking is refunded. A rate plan's rules say what
 * share of the booking value is refundable when cancelling at least N hours
 * before check-in; the hotel keeps the rest. Money already paid beyond what
 * the hotel keeps is refunded, so a guest who paid only an advance gets back
 * whatever that advance exceeds the cancellation charge by.
 */

export type RefundInput = {
  rules: readonly CancellationRule[];
  isRefundable: boolean;
  checkInAt: Date;
  now: Date;
  totalPaise: number;
  paidPaise: number;
  refundedPaise: number;
};

export type RefundQuote = {
  /** Share of the booking value that is refundable (0–100). */
  percent: number;
  /** What the hotel keeps as the cancellation charge. */
  chargePaise: number;
  refundPaise: number;
  hoursBefore: number;
};

/** Check-in moment in India for a stay date and the hotel's check-in time ("HH:MM"). */
export function checkInInstant(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+05:30`);
}

export function refundablePercent(
  rules: readonly CancellationRule[],
  isRefundable: boolean,
  hoursBefore: number,
): number {
  if (!isRefundable || hoursBefore <= 0) return 0;
  return rules
    .filter((r) => hoursBefore >= r.hours_before)
    .reduce((best, r) => Math.max(best, Math.min(100, Math.max(0, r.refund_percent))), 0);
}

export function quoteRefund(input: RefundInput): RefundQuote {
  const hoursBefore = (input.checkInAt.getTime() - input.now.getTime()) / 3_600_000;
  const percent = refundablePercent(input.rules, input.isRefundable, hoursBefore);
  const charge = Math.round((input.totalPaise * (100 - percent)) / 100);
  const outstanding = Math.max(0, input.paidPaise - input.refundedPaise);
  const refund = Math.max(0, Math.min(outstanding, input.paidPaise - charge - input.refundedPaise));
  return {
    percent,
    chargePaise: charge,
    refundPaise: refund,
    hoursBefore: Math.max(0, Math.floor(hoursBefore)),
  };
}
