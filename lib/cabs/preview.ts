import type { CouponRejection } from "@/lib/coupons/engine";
import type { LineKind } from "@/lib/pricing/booking";
import type { CabCheckoutError, CabCheckoutQuote } from "./checkout";
import type { CabInclusions } from "./pricing";

/** What the cab review page needs from a server-side quote (plain, serialisable). */
export type CabPreview = {
  ok: true;
  paymentMode: "full" | "part";
  /** Null when the advance would be the whole fare (part pay not offered). */
  advancePaise: number | null;
  advancePercent: number;
  lines: { key: string; kind: LineKind; amountPaise: number; quantity: number }[];
  addons: { key: string; pricePaise: number; selected: boolean }[];
  inclusions: CabInclusions;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  payableNowPaise: number;
  /** Paid to the driver at the end of a part-paid trip. */
  balancePaise: number;
  coupon: { code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  holdMinutes: number;
  cancellationRules: { hours_before: number; refund_percent: number }[];
  online: boolean;
};

export type CabPreviewResult = CabPreview | { ok: false; error: CabCheckoutError | "invalid" };

export function toCabPreview(q: CabCheckoutQuote): CabPreview {
  return {
    ok: true,
    paymentMode: q.paymentMode,
    advancePaise: q.advancePaise,
    advancePercent: q.settings.advance_percent,
    lines: q.price.lines.map((l) => ({
      key: l.key,
      kind: l.kind,
      amountPaise: l.amountPaise,
      quantity: l.quantity,
    })),
    addons: q.addons.map((a) => ({
      key: a.key,
      pricePaise: a.pricePaise,
      selected: q.selectedAddons.includes(a.key),
    })),
    inclusions: q.inclusions,
    subtotalPaise: q.price.subtotalPaise,
    discountPaise: q.price.discountPaise,
    taxPaise: q.price.taxPaise,
    totalPaise: q.price.totalPaise,
    payableNowPaise: q.payableNowPaise,
    balancePaise: q.price.totalPaise - q.payableNowPaise,
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.coupon.discountPaise } : null,
    couponError: q.couponError,
    holdMinutes: q.settings.hold_minutes,
    cancellationRules: q.settings.cancellation_rules,
    online: q.online,
  };
}
