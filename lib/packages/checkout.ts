import "server-only";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { checkCoupon } from "@/lib/coupons/check";
import { normalizeCouponCode, type CouponRejection } from "@/lib/coupons/engine";
import { todayInIndia } from "@/lib/dates";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { discountableBase, finalizePrice, payableNow, type BookingPrice } from "@/lib/pricing/booking";
import type { PackageCheckout, PackagesSettings } from "@/schemas/packages";
import { departureState, endDate, firstBookableDate, packageLines, type PackageQuoteError } from "./pricing";
import { getLivePackage, getPackagesSettings } from "./queries";
import type { Departure, PackageDetail } from "./types";

/**
 * Prices a package booking on the server from the live catalog, settings
 * and the coupon table. The booking page shows this; the booking action
 * calls it again and stores exactly what it returns.
 */

export const PACKAGE_FLAG = "booking.packages";

export type PackageCheckoutError =
  | PackageQuoteError
  | "not_found"
  | "booking_closed"
  | "enquiry_only"
  | "departure_required"
  | "departure_closed"
  | "sold_out"
  | "too_many";

export type PackageCheckoutQuote = {
  ok: true;
  pkg: PackageDetail;
  departure: Departure | null;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  price: BookingPrice;
  paymentMode: "full" | "part";
  advancePercent: number;
  /** Null when the advance would be the whole price (part pay not offered). */
  advancePaise: number | null;
  payableNowPaise: number;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  settings: PackagesSettings;
  online: boolean;
};

export type PackageCheckoutResult = PackageCheckoutQuote | { ok: false; error: PackageCheckoutError };

export async function preparePackageCheckout(
  input: PackageCheckout,
  userId: string | null,
): Promise<PackageCheckoutResult> {
  const [pkg, settings, payments, invoice, enabled] = await Promise.all([
    getLivePackage(input.packageSlug),
    getPackagesSettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
    getFeatureFlag(PACKAGE_FLAG),
  ]);
  if (!pkg) return { ok: false, error: "not_found" };
  if (pkg.bookingMode !== "book") return { ok: false, error: "enquiry_only" };
  if (!enabled) return { ok: false, error: "booking_closed" };
  const pax = input.adults + input.children;
  if (pax > settings.max_travellers) return { ok: false, error: "too_many" };

  const today = todayInIndia();
  let departure: Departure | null = null;
  if (pkg.fixedDepartures) {
    if (!input.departureId) return { ok: false, error: "departure_required" };
    departure = pkg.departures.find((d) => d.id === input.departureId) ?? null;
    if (!departure || departure.startDate !== input.startDate)
      return { ok: false, error: "departure_closed" };
    const state = departureState(departure, pax, today, settings.book_until_days);
    if (state !== "open") return { ok: false, error: state === "sold_out" ? "sold_out" : "departure_closed" };
  } else if (input.startDate < firstBookableDate(today, settings.book_until_days)) {
    return { ok: false, error: "departure_closed" };
  }

  const lines = packageLines(
    pkg,
    departure,
    { startDate: input.startDate, adults: input.adults, children: input.children },
    {
      convenienceFeePaise: payments.convenience_fee_paise,
      feeTaxBps: payments.fee_tax_bps,
      feeSac: invoice.sac_services,
    },
  );
  if (!lines.ok) return lines;

  const code = input.coupon ? normalizeCouponCode(input.coupon) : "";
  const { coupon, error: couponError } = code
    ? await checkCoupon(code, {
        service: "package",
        hotelId: null,
        basePaise: discountableBase(lines.quote.drafts),
        userId,
      })
    : { coupon: null, error: null };
  const price = finalizePrice(lines.quote.drafts, coupon?.discountPaise ?? 0, []);

  const advancePercent = pkg.advancePercent ?? settings.advance_percent;
  const advance = payableNow(price.totalPaise, "part", advancePercent);
  const partAllowed = advance < price.totalPaise;
  const paymentMode = input.paymentMode === "part" && partAllowed ? "part" : "full";

  return {
    ok: true,
    pkg,
    departure,
    startDate: input.startDate,
    endDate: endDate(input.startDate, pkg.days),
    adults: input.adults,
    children: input.children,
    price,
    paymentMode,
    advancePercent,
    advancePaise: partAllowed ? advance : null,
    payableNowPaise: paymentMode === "part" ? advance : price.totalPaise,
    coupon,
    couponError,
    settings,
    online: Boolean(razorpayConfig()) && hasServiceRole(),
  };
}

/** What the booking page needs (plain, serialisable). */
export type PackagePreview = {
  ok: true;
  startDate: string;
  endDate: string;
  lines: { key: string; kind: string; description: string; quantity: number; amountPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  paymentMode: "full" | "part";
  advancePercent: number;
  advancePaise: number | null;
  payableNowPaise: number;
  balancePaise: number;
  coupon: { code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  holdMinutes: number;
  online: boolean;
};

export type PackagePreviewResult = PackagePreview | { ok: false; error: PackageCheckoutError | "invalid" };

export function toPackagePreview(q: PackageCheckoutQuote): PackagePreview {
  return {
    ok: true,
    startDate: q.startDate,
    endDate: q.endDate,
    lines: q.price.lines.map((l) => ({
      key: l.key,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity,
      amountPaise: l.amountPaise,
    })),
    subtotalPaise: q.price.subtotalPaise,
    discountPaise: q.price.discountPaise,
    taxPaise: q.price.taxPaise,
    totalPaise: q.price.totalPaise,
    paymentMode: q.paymentMode,
    advancePercent: q.advancePercent,
    advancePaise: q.advancePaise,
    payableNowPaise: q.payableNowPaise,
    balancePaise: q.price.totalPaise - q.payableNowPaise,
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.coupon.discountPaise } : null,
    couponError: q.couponError,
    holdMinutes: q.settings.hold_minutes,
    online: q.online,
  };
}
