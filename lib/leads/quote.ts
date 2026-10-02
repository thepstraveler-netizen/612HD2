import { finalizePrice, type BookingPrice, type DraftLine } from "@/lib/pricing/booking";
import type { QuoteLineDraft } from "@/schemas/leads";

/**
 * Quote pricing. Agents type lines (description, quantity, unit price
 * before GST, GST %, SAC); this turns them into invoice-ready lines with
 * the shared pricing code, so the quote, the booking it creates and the
 * invoice all match. Pure.
 */

export type QuoteLine = {
  key: string;
  description: string;
  quantity: number;
  unit_price_paise: number;
  amount_paise: number;
  tax_rate_bps: number;
  tax_paise: number;
  sac: string;
};

export type PricedQuote = {
  lines: QuoteLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
};

export function priceQuote(input: readonly QuoteLineDraft[]): PricedQuote {
  const drafts: DraftLine[] = input.map((l, i) => ({
    key: `line:${i + 1}`,
    kind: "service",
    description: l.description,
    date: null,
    roomId: null,
    ratePlanId: null,
    quantity: l.quantity,
    amountPaise: l.unitPrice * l.quantity,
    discountable: false,
    tax: { mode: "fixed", rateBps: l.taxPercent },
    sac: l.sac,
  }));
  const price: BookingPrice = finalizePrice(drafts, 0, []);
  return {
    lines: price.lines.map((l, i) => ({
      key: l.key,
      description: l.description,
      quantity: l.quantity,
      unit_price_paise: input[i].unitPrice,
      amount_paise: l.amountPaise,
      tax_rate_bps: l.taxRateBps,
      tax_paise: l.taxPaise,
      sac: l.sac,
    })),
    subtotalPaise: price.subtotalPaise,
    taxPaise: price.taxPaise,
    totalPaise: price.totalPaise,
  };
}

export type PayNowError = "advance_required" | "advance_too_high";

/** What the payment link collects: the total, or an advance below it. */
export function payNowAmount(
  totalPaise: number,
  mode: "full" | "advance",
  advancePaise: number | "",
): { ok: true; paise: number } | { ok: false; error: PayNowError } {
  if (mode === "full") return { ok: true, paise: totalPaise };
  if (advancePaise === "" || advancePaise <= 0) return { ok: false, error: "advance_required" };
  if (advancePaise >= totalPaise) return { ok: false, error: "advance_too_high" };
  return { ok: true, paise: advancePaise };
}

export type QuoteState = "draft" | "sent" | "paid" | "expired" | "cancelled";

/** A sent quote past its validity reads as expired before the cleanup runs. */
export function effectiveQuoteStatus(
  status: QuoteState,
  validUntil: string,
  now: Date = new Date(),
): QuoteState {
  return status === "sent" && Date.parse(validUntil) <= now.getTime() ? "expired" : status;
}
