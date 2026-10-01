import type { CouponRejection } from "@/lib/coupons/engine";
import type { AddonKey } from "@/lib/pricing/booking";
import type { PaymentModeKey } from "@/schemas/booking";
import type { CheckoutError, CheckoutQuote } from "./hotel-checkout";

/** What the review page needs from a server-side checkout quote (plain, serialisable). */
export type CheckoutPreview = {
  ok: true;
  paymentMode: PaymentModeKey;
  modes: PaymentModeKey[];
  advancePercent: number | null;
  addons: { key: AddonKey; unitPaise: number; selected: boolean; quantity: number; amountPaise: number }[];
  roomChargesPaise: number;
  extraGuestPaise: number;
  feePaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  payableNowPaise: number;
  coupon: { code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  holdMinutes: number;
};

export type PreviewResult = CheckoutPreview | { ok: false; error: CheckoutError | "invalid" };

export function toPreview(q: CheckoutQuote): CheckoutPreview {
  const line = (key: string) => q.price.lines.find((l) => l.key === key);
  return {
    ok: true,
    paymentMode: q.paymentMode,
    modes: q.options.modes,
    advancePercent: q.options.advancePercent,
    addons: q.options.addons.map((key) => {
      const l = line(`addon:${key}`);
      return {
        key,
        unitPaise: q.hotel.addonPrices[key] ?? 0,
        selected: Boolean(l),
        quantity: l?.quantity ?? 0,
        amountPaise: l?.amountPaise ?? 0,
      };
    }),
    roomChargesPaise: q.quote.roomChargesPaise,
    extraGuestPaise: q.quote.extraGuestPaise,
    feePaise: line("fee:convenience")?.amountPaise ?? 0,
    discountPaise: q.price.discountPaise,
    taxPaise: q.price.taxPaise,
    totalPaise: q.price.totalPaise,
    payableNowPaise: q.payableNowPaise,
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.coupon.discountPaise } : null,
    couponError: q.couponError,
    holdMinutes: q.holdMinutes,
  };
}
