import "server-only";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { checkCoupon } from "@/lib/coupons/check";
import { normalizeCouponCode, type CouponRejection } from "@/lib/coupons/engine";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { discountableBase, finalizePrice, type BookingPrice } from "@/lib/pricing/booking";
import type { RideCheckout, RidePaymentMode, RideSettings } from "@/schemas/rides";
import type { RideTerms } from "./pricing";
import { getRideCatalog, getRideSettings, type RideVehicleType } from "./queries";
import { planRide, quoteVehicle, type RidePlan, type RidePlanError } from "./search";

/**
 * Prices a ride checkout on the server from the catalog, settings and the
 * coupon table. The review page shows this; the booking action calls it
 * again and stores exactly what it returns.
 *
 * Payment: "driver" (pay at the end; needs `pay_later_enabled`) or
 * "online" (whole fare now; needs Razorpay). Vehicle types booked on
 * request are pay-the-driver only, so nobody pays for a ride staff may
 * still decline.
 */

export type RideCheckoutError = RidePlanError | "not_found" | "booking_closed" | "too_small";

export type RideCheckoutQuote = {
  ok: true;
  plan: RidePlan;
  type: RideVehicleType;
  price: BookingPrice;
  terms: RideTerms;
  pay: RidePaymentMode;
  payModes: RidePaymentMode[];
  payableNowPaise: number;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  settings: RideSettings;
};

export type RideCheckoutResult = RideCheckoutQuote | { ok: false; error: RideCheckoutError };

export async function prepareRideCheckout(
  input: RideCheckout,
  userId: string | null,
): Promise<RideCheckoutResult> {
  const [catalog, settings, payments, invoice, enabled] = await Promise.all([
    getRideCatalog(),
    getRideSettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
    getFeatureFlag("booking.rides"),
  ]);
  if (!enabled || !hasServiceRole()) return { ok: false, error: "booking_closed" };

  const planned = planRide(input, catalog, settings, new Date());
  if (!planned.ok) return planned;
  const { plan } = planned;
  const type = catalog.types.find((t) => t.key === input.v);
  if (!type) return { ok: false, error: "not_found" };
  if (type.seats < plan.passengers) return { ok: false, error: "too_small" };

  const payModes: RidePaymentMode[] = [];
  if (Boolean(razorpayConfig()) && type.instantBook) payModes.push("online");
  if (settings.pay_later_enabled) payModes.push("driver");
  if (payModes.length === 0) return { ok: false, error: "booking_closed" };
  const pay = payModes.includes(input.pay) ? input.pay : payModes[payModes.length - 1];

  const quote = quoteVehicle(
    plan,
    type,
    catalog,
    settings,
    pay === "online"
      ? {
          convenienceFeePaise: payments.convenience_fee_paise,
          feeTaxBps: payments.fee_tax_bps,
          feeSac: invoice.sac_services,
        }
      : null,
  );
  if (!quote) return { ok: false, error: "not_found" };

  const code = input.coupon ? normalizeCouponCode(input.coupon) : "";
  const { coupon, error: couponError } = code
    ? await checkCoupon(code, {
        service: "ride",
        hotelId: null,
        basePaise: discountableBase(quote.drafts),
        userId,
      })
    : { coupon: null, error: null };
  const price = finalizePrice(quote.drafts, coupon?.discountPaise ?? 0, []);

  return {
    ok: true,
    plan,
    type,
    price,
    terms: quote.terms,
    pay,
    payModes,
    payableNowPaise: pay === "online" ? price.totalPaise : 0,
    coupon,
    couponError,
    settings,
  };
}
