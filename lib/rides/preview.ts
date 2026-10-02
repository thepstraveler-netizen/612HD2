import type { CouponRejection } from "@/lib/coupons/engine";
import type { LineKind } from "@/lib/pricing/booking";
import type { RidePaymentMode } from "@/schemas/rides";
import type { RideCheckoutError, RideCheckoutQuote } from "./checkout";
import type { RideTerms } from "./pricing";

/** What the ride review page needs from a server-side quote (plain, serialisable). */
export type RidePreview = {
  ok: true;
  pay: RidePaymentMode;
  payModes: RidePaymentMode[];
  lines: { key: string; kind: LineKind; amountPaise: number }[];
  terms: RideTerms;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  payableNowPaise: number;
  /** Paid to the driver at the end of the ride. */
  balancePaise: number;
  coupon: { code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  pickupAt: string;
  isNow: boolean;
  distanceKm: number | null;
  durationMinutes: number | null;
  instantBook: boolean;
  holdMinutes: number;
  cancellationRules: { hours_before: number; refund_percent: number }[];
};

export type RidePreviewResult = RidePreview | { ok: false; error: RideCheckoutError | "invalid" };

export function toRidePreview(q: RideCheckoutQuote): RidePreview {
  return {
    ok: true,
    pay: q.pay,
    payModes: q.payModes,
    lines: q.price.lines.map((l) => ({ key: l.key, kind: l.kind, amountPaise: l.amountPaise })),
    terms: q.terms,
    subtotalPaise: q.price.subtotalPaise,
    discountPaise: q.price.discountPaise,
    taxPaise: q.price.taxPaise,
    totalPaise: q.price.totalPaise,
    payableNowPaise: q.payableNowPaise,
    balancePaise: q.price.totalPaise - q.payableNowPaise,
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.coupon.discountPaise } : null,
    couponError: q.couponError,
    pickupAt: q.plan.pickupAt.toISOString(),
    isNow: q.plan.isNow,
    distanceKm: q.plan.distanceKm,
    durationMinutes: q.plan.durationMinutes,
    instantBook: q.type.instantBook,
    holdMinutes: q.settings.hold_minutes,
    cancellationRules: q.settings.cancellation_rules,
  };
}
