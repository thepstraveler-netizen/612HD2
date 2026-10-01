import "server-only";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { checkCoupon } from "@/lib/coupons/check";
import { normalizeCouponCode, type CouponRejection } from "@/lib/coupons/engine";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { discountableBase, finalizePrice, type BookingPrice } from "@/lib/pricing/booking";
import type { CabCheckout, CabSettings } from "@/schemas/cabs";
import { cabAdvance, type CabInclusions } from "./pricing";
import { getCabCatalog, getCabSettings, type CabAddon, type CabCategory } from "./queries";
import { addonsFor, planTrip, quoteCategory, type PlanError, type TripPlan } from "./search";

/**
 * Prices a cab checkout on the server from the catalog, settings and the
 * coupon table. The review page shows this; the booking action calls it
 * again and stores exactly what it returns.
 */

export type CabCheckoutError = PlanError | "not_found" | "booking_closed" | "too_small";

export type CabCheckoutQuote = {
  ok: true;
  plan: TripPlan;
  category: CabCategory;
  addons: CabAddon[];
  selectedAddons: string[];
  price: BookingPrice;
  inclusions: CabInclusions;
  paymentMode: "full" | "part";
  payableNowPaise: number;
  advancePaise: number | null;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  settings: CabSettings;
  online: boolean;
};

export type CabCheckoutResult = CabCheckoutQuote | { ok: false; error: CabCheckoutError };

export async function prepareCabCheckout(
  input: CabCheckout,
  userId: string | null,
): Promise<CabCheckoutResult> {
  const [catalog, settings, payments, invoice, enabled] = await Promise.all([
    getCabCatalog(),
    getCabSettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
    getFeatureFlag("booking.cabs"),
  ]);
  if (!enabled) return { ok: false, error: "booking_closed" };

  const planned = planTrip(input, catalog, settings, new Date());
  if (!planned.ok) return planned;
  const { plan } = planned;
  const category = catalog.categories.find((c) => c.key === input.category);
  if (!category) return { ok: false, error: "not_found" };
  if (category.seats < plan.passengers) return { ok: false, error: "too_small" };

  const offered = addonsFor(catalog, plan.tripType, category.id);
  const selected = offered.filter((a) => input.addons.includes(a.key));
  const online = Boolean(razorpayConfig()) && hasServiceRole();
  const quote = quoteCategory(plan, category, catalog, settings, {
    addons: selected.map((a) => ({ key: a.key, name: a.name.en, pricePaise: a.pricePaise })),
    fee: {
      convenienceFeePaise: payments.convenience_fee_paise,
      feeTaxBps: payments.fee_tax_bps,
      feeSac: invoice.sac_services,
    },
  });
  if (!quote) return { ok: false, error: "not_found" };

  const code = input.coupon ? normalizeCouponCode(input.coupon) : "";
  const { coupon, error: couponError } = code
    ? await checkCoupon(code, {
        service: "cab",
        hotelId: null,
        basePaise: discountableBase(quote.drafts),
        userId,
      })
    : { coupon: null, error: null };
  const price = finalizePrice(quote.drafts, coupon?.discountPaise ?? 0, []);

  const advance = cabAdvance(price.totalPaise, settings.advance_percent, settings.min_advance_paise);
  const partAllowed = advance < price.totalPaise;
  const paymentMode = input.paymentMode === "part" && partAllowed ? "part" : "full";

  return {
    ok: true,
    plan,
    category,
    addons: offered,
    selectedAddons: selected.map((a) => a.key),
    price,
    inclusions: quote.inclusions,
    paymentMode,
    payableNowPaise: paymentMode === "part" ? advance : price.totalPaise,
    advancePaise: partAllowed ? advance : null,
    coupon,
    couponError,
    settings,
    online,
  };
}
