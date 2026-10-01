import "server-only";
import { quoteStay, type StayQuote, type StayRequest, type Unavailable } from "@/lib/availability/engine";
import { checkCoupon } from "@/lib/coupons/check";
import { normalizeCouponCode, type CouponRejection } from "@/lib/coupons/engine";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { getGstSlabs, getHotelCalendar, getHotelCatalog, getHotelSearchDefaults } from "@/lib/hotels/queries";
import { stayFromSearch } from "@/lib/hotels/search";
import type { CatalogHotel, CatalogPlan, CatalogRoom } from "@/lib/hotels/types";
import { todayInIndia } from "@/lib/dates";
import {
  availableAddons,
  buildHotelLines,
  discountableBase,
  finalizePrice,
  payableNow,
  type AddonKey,
  type BookingPrice,
} from "@/lib/pricing/booking";
import { checkInInstant } from "@/lib/refunds/policy";
import { parseHotelSearch } from "@/schemas/hotels";
import type { HotelCheckout, PaymentModeKey } from "@/schemas/booking";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "./settings";

/**
 * Prices a hotel checkout entirely on the server from the catalog, live
 * inventory, settings and the coupon table. The review page shows this; the
 * booking action calls it again and stores exactly what it returns, so a
 * tampered browser cannot change what is charged.
 */

export type CheckoutError = "not_found" | "invalid_stay" | "booking_closed" | Unavailable;

export type CheckoutOptions = {
  modes: PaymentModeKey[];
  advancePercent: number | null;
  addons: AddonKey[];
  online: boolean;
};

export type CheckoutQuote = {
  ok: true;
  hotel: CatalogHotel;
  room: CatalogRoom;
  plan: CatalogPlan;
  stay: StayRequest;
  quote: StayQuote;
  price: BookingPrice;
  paymentMode: PaymentModeKey;
  payableNowPaise: number;
  options: CheckoutOptions;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  checkInAt: Date;
  holdMinutes: number;
  customerCancellation: boolean;
};

export type CheckoutResult = CheckoutQuote | { ok: false; error: CheckoutError };

export async function prepareHotelCheckout(
  input: HotelCheckout,
  userId: string | null,
): Promise<CheckoutResult> {
  const [catalog, defaults, gstSlabs, settings, invoice, enabled] = await Promise.all([
    getHotelCatalog(),
    getHotelSearchDefaults(),
    getGstSlabs(),
    getPaymentSettings(),
    getInvoiceSettings(),
    getFeatureFlag("booking.hotels"),
  ]);
  if (!enabled) return { ok: false, error: "booking_closed" };

  const hotel = catalog.hotels.find((h) => h.slug === input.hotel);
  const plan = hotel?.plans.find((p) => p.id === input.plan);
  const room = plan ? hotel?.rooms.find((r) => r.id === plan.roomId) : undefined;
  if (!hotel || !plan || !room) return { ok: false, error: "not_found" };

  const stay = stayFromSearch(
    parseHotelSearch({
      checkin: input.checkin,
      checkout: input.checkout,
      rooms: String(input.rooms),
      adults: String(input.adults),
      children: String(input.children),
    }),
    defaults,
    todayInIndia(),
  );
  if (!stay) return { ok: false, error: "invalid_stay" };

  const calendar = await getHotelCalendar([hotel], stay.checkIn, stay.checkOut, { live: true });
  const quote = quoteStay(room, plan, stay, calendar, gstSlabs);
  if (!quote.ok) return { ok: false, error: quote.reason };

  const online = Boolean(razorpayConfig()) && hasServiceRole();
  const advancePercent =
    hotel.partPaymentPercent ?? (settings.part_payment_enabled ? settings.advance_percent : null);
  const modes: PaymentModeKey[] = [];
  if (online) modes.push("full");
  if (online && advancePercent !== null) modes.push("part");
  if (hotel.payAtHotel && settings.pay_at_hotel_enabled && hasServiceRole()) modes.push("pay_at_hotel");
  if (modes.length === 0) return { ok: false, error: "booking_closed" };
  const paymentMode = modes.includes(input.paymentMode) ? input.paymentMode : modes[0];

  const drafts = buildHotelLines({
    quote,
    roomName: room.name.en,
    planName: plan.name.en,
    mealPlan: plan.mealPlan,
    rooms: stay.rooms,
    guests: stay.adults + stay.children,
    addons: input.addons,
    addonPrices: hotel.addonPrices,
    convenienceFeePaise: paymentMode === "pay_at_hotel" ? 0 : settings.convenience_fee_paise,
    feeTaxBps: settings.fee_tax_bps,
    sac: { accommodation: invoice.sac_accommodation, services: invoice.sac_services },
  });

  const code = input.coupon ? normalizeCouponCode(input.coupon) : "";
  const { coupon, error: couponError } = code
    ? await checkCoupon(code, {
        service: "hotel",
        hotelId: hotel.id,
        basePaise: discountableBase(drafts),
        userId,
      })
    : { coupon: null, error: null };
  const price = finalizePrice(drafts, coupon?.discountPaise ?? 0, gstSlabs);

  return {
    ok: true,
    hotel,
    room,
    plan,
    stay,
    quote,
    price,
    paymentMode,
    payableNowPaise: payableNow(price.totalPaise, paymentMode, advancePercent ?? 100),
    options: { modes, advancePercent, addons: availableAddons(hotel.addonPrices, plan.mealPlan), online },
    coupon,
    couponError,
    checkInAt: checkInInstant(stay.checkIn, hotel.checkInTime),
    holdMinutes: settings.hold_minutes,
    customerCancellation: settings.customer_cancellation_enabled,
  };
}
