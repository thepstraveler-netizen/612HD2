import { describe, expect, it } from "vitest";
import {
  indexCalendar,
  quoteStay,
  type RatePlan,
  type RoomType,
  type StayQuote,
} from "@/lib/availability/engine";
import {
  BOOKING_STATUSES,
  balanceDue,
  canTransition,
  customerCanCancel,
  generateBookingCode,
} from "@/lib/bookings/state";
import {
  couponDiscount,
  evaluateCoupon,
  normalizeCouponCode,
  type Coupon,
  type CouponContext,
} from "@/lib/coupons/engine";
import { hmacHex, verifyPaymentSignature, verifyWebhookSignature } from "@/lib/payments/signature";
import {
  allocate,
  availableAddons,
  buildHotelLines,
  discountableBase,
  finalizePrice,
  payableNow,
  splitGst,
  type HotelLinesInput,
} from "@/lib/pricing/booking";
import { DEFAULT_GST_SLABS } from "@/lib/pricing/tax";
import { checkInInstant, quoteRefund, refundablePercent } from "@/lib/refunds/policy";

const room: RoomType = {
  id: "deluxe",
  baseOccupancy: 2,
  maxAdults: 3,
  maxChildren: 2,
  maxOccupancy: 4,
  totalUnits: 5,
  isActive: true,
};
const plan: RatePlan = {
  id: "deluxe-ep",
  roomId: "deluxe",
  mealPlan: "room_only",
  isRefundable: true,
  cancellationRules: [
    { hours_before: 72, refund_percent: 100 },
    { hours_before: 24, refund_percent: 50 },
  ],
  basePricePaise: 200_000,
  extraAdultPaise: 50_000,
  extraChildPaise: 30_000,
  minStay: 1,
  maxStay: null,
  isActive: true,
};

function quote(adults = 2, rooms = 1, price = plan.basePricePaise): StayQuote {
  const q = quoteStay(
    room,
    { ...plan, basePricePaise: price },
    { checkIn: "2026-11-02", checkOut: "2026-11-04", rooms, adults, children: 0 },
    indexCalendar([], [], []),
    DEFAULT_GST_SLABS,
  );
  if (!q.ok) throw new Error(q.reason);
  return q;
}

const linesInput = (overrides: Partial<HotelLinesInput> = {}): HotelLinesInput => ({
  quote: quote(),
  roomName: "Deluxe",
  planName: "Room only",
  mealPlan: "room_only",
  rooms: 1,
  guests: 2,
  addons: {},
  addonPrices: { early_checkin: 50_000, late_checkout: null, breakfast: 15_000 },
  convenienceFeePaise: 0,
  feeTaxBps: 1800,
  sac: { accommodation: "996311", services: "998552" },
  ...overrides,
});

describe("booking price", () => {
  it("matches the stay quote when there is nothing extra", () => {
    const q = quote(3);
    const price = finalizePrice(buildHotelLines(linesInput({ quote: q, guests: 3 })), 0, DEFAULT_GST_SLABS);
    expect(price.lines).toHaveLength(2); // one line per room-night
    expect(price.subtotalPaise).toBe(q.subtotalPaise);
    expect(price.taxPaise).toBe(q.taxPaise);
    expect(price.totalPaise).toBe(q.totalPaise);
  });

  it("adds add-ons at the stay's GST rate and the fee at its own", () => {
    const drafts = buildHotelLines(
      linesInput({
        addons: { early_checkin: true, breakfast: true, late_checkout: true },
        convenienceFeePaise: 5_000,
      }),
    );
    const keys = drafts.map((l) => l.key);
    expect(keys).toContain("addon:early_checkin");
    expect(keys).not.toContain("addon:late_checkout"); // not offered by this hotel
    const breakfast = drafts.find((l) => l.key === "addon:breakfast");
    expect(breakfast).toMatchObject({ quantity: 4, amountPaise: 60_000 }); // 2 guests × 2 nights
    const price = finalizePrice(drafts, 0, DEFAULT_GST_SLABS);
    expect(price.lines.find((l) => l.key === "addon:early_checkin")?.taxRateBps).toBe(500);
    expect(price.lines.find((l) => l.key === "fee:convenience")).toMatchObject({
      taxRateBps: 1800,
      taxPaise: 900,
    });
    expect(price.totalPaise).toBe(price.subtotalPaise + price.taxPaise);
  });

  it("offers breakfast only on room-only plans", () => {
    const prices = { early_checkin: 1, late_checkout: 1, breakfast: 1 };
    expect(availableAddons(prices, "breakfast")).toEqual(["early_checkin", "late_checkout"]);
    expect(availableAddons({ ...prices, early_checkin: null }, "room_only")).toEqual([
      "late_checkout",
      "breakfast",
    ]);
  });

  it("spreads a coupon over the lines so the parts add up exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    const drafts = buildHotelLines(
      linesInput({ addons: { early_checkin: true }, convenienceFeePaise: 5_000 }),
    );
    expect(discountableBase(drafts)).toBe(450_000);
    const price = finalizePrice(drafts, 45_001, DEFAULT_GST_SLABS);
    expect(price.discountPaise).toBe(45_001);
    expect(price.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(45_001);
    expect(price.lines.find((l) => l.kind === "fee")?.discountPaise).toBe(0);
  });

  it("decides each room-night's GST slab after the discount", () => {
    // ₹1,050 a night is in the 5% slab; a ₹100 discount per night brings it under ₹1,000 (0%).
    const q = quote(2, 1, 105_000);
    const drafts = buildHotelLines(linesInput({ quote: q }));
    expect(finalizePrice(drafts, 0, DEFAULT_GST_SLABS).taxPaise).toBe(2 * 5_250);
    expect(finalizePrice(drafts, 20_000, DEFAULT_GST_SLABS).taxPaise).toBe(0);
  });

  it("never discounts more than the discountable amount", () => {
    const drafts = buildHotelLines(linesInput());
    expect(finalizePrice(drafts, 10_000_000, DEFAULT_GST_SLABS)).toMatchObject({
      discountPaise: 400_000,
      totalPaise: 0,
    });
  });

  it("works out the amount payable now", () => {
    expect(payableNow(1_234_567, "full", 25)).toBe(1_234_567);
    expect(payableNow(1_234_567, "pay_at_hotel", 25)).toBe(0);
    expect(payableNow(1_234_567, "part", 25)).toBe(308_700); // ₹3,086.42 rounded up to ₹3,087
    expect(payableNow(50, "part", 25)).toBe(50);
  });

  it("splits GST into equal CGST and SGST", () => {
    expect(splitGst(1_001)).toEqual({ cgstPaise: 500, sgstPaise: 501 });
  });
});

const coupon = (overrides: Partial<Coupon> = {}): Coupon => ({
  id: "c",
  code: "SAVE10",
  discountType: "percent",
  value: 1000,
  maxDiscountPaise: 50_000,
  minOrderPaise: 100_000,
  services: ["hotel"],
  hotelIds: [],
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perUserLimit: 1,
  firstBookingOnly: false,
  isActive: true,
  ...overrides,
});
const ctx = (overrides: Partial<CouponContext> = {}): CouponContext => ({
  service: "hotel",
  hotelId: "h1",
  basePaise: 300_000,
  now: new Date("2026-10-01T10:00:00Z"),
  usedCount: 0,
  userUsedCount: 0,
  userHasPriorBooking: false,
  ...overrides,
});

describe("coupons", () => {
  it("computes percent and flat discounts with caps", () => {
    expect(couponDiscount(coupon(), 300_000)).toBe(30_000);
    expect(couponDiscount(coupon(), 900_000)).toBe(50_000);
    expect(
      couponDiscount(coupon({ discountType: "flat", value: 30_000, maxDiscountPaise: null }), 20_000),
    ).toBe(20_000);
  });

  it("accepts a valid coupon", () => {
    expect(evaluateCoupon(coupon(), ctx())).toEqual({ ok: true, discountPaise: 30_000 });
  });

  it.each([
    [null, {}, "not_found"],
    [{ isActive: false }, {}, "inactive"],
    [{ startsAt: "2026-10-02T00:00:00Z" }, {}, "not_started"],
    [{ endsAt: "2026-10-01T09:00:00Z" }, {}, "expired"],
    [{ services: ["cab"] }, {}, "service"],
    [{ hotelIds: ["h2"] }, {}, "hotel"],
    [{}, { basePaise: 99_999 }, "min_order"],
    [{ usageLimit: 5 }, { usedCount: 5 }, "exhausted"],
    [{}, { userUsedCount: 1 }, "used"],
    [{ firstBookingOnly: true }, { userHasPriorBooking: true }, "first_booking"],
  ] as const)("rejects %o %o as %s", (overrides, context, reason) => {
    const c = overrides === null ? null : coupon(overrides as Partial<Coupon>);
    expect(evaluateCoupon(c, ctx(context))).toEqual({ ok: false, reason });
  });

  it("normalises typed codes", () => {
    expect(normalizeCouponCode("  save 10 ")).toBe("SAVE10");
  });
});

describe("refund policy", () => {
  const checkIn = checkInInstant("2026-11-10", "12:00");
  const base = {
    rules: plan.cancellationRules,
    isRefundable: true,
    checkInAt: checkIn,
    totalPaise: 400_000,
    paidPaise: 400_000,
    refundedPaise: 0,
  };
  const at = (hoursBefore: number) => new Date(checkIn.getTime() - hoursBefore * 3_600_000);

  it("reads check-in in India time", () => {
    expect(checkIn.toISOString()).toBe("2026-11-10T06:30:00.000Z");
  });

  it("picks the most generous rule the guest still qualifies for", () => {
    expect(refundablePercent(plan.cancellationRules, true, 100)).toBe(100);
    expect(refundablePercent(plan.cancellationRules, true, 48)).toBe(50);
    expect(refundablePercent(plan.cancellationRules, true, 2)).toBe(0);
    expect(refundablePercent(plan.cancellationRules, false, 100)).toBe(0);
  });

  it("refunds by booking value and keeps the cancellation charge", () => {
    expect(quoteRefund({ ...base, now: at(80) })).toMatchObject({
      percent: 100,
      refundPaise: 400_000,
      chargePaise: 0,
    });
    expect(quoteRefund({ ...base, now: at(30) })).toMatchObject({ percent: 50, refundPaise: 200_000 });
    expect(quoteRefund({ ...base, now: at(-1) })).toMatchObject({ percent: 0, refundPaise: 0 });
  });

  it("refunds an advance only beyond what the hotel keeps", () => {
    expect(quoteRefund({ ...base, paidPaise: 100_000, now: at(30) }).refundPaise).toBe(0);
    expect(quoteRefund({ ...base, paidPaise: 100_000, now: at(80) }).refundPaise).toBe(100_000);
    expect(quoteRefund({ ...base, refundedPaise: 50_000, now: at(80) }).refundPaise).toBe(350_000);
  });
});

describe("booking lifecycle", () => {
  it("only moves along allowed transitions", () => {
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("expired", "confirmed")).toBe(true); // late payment, room still free
    expect(canTransition("confirmed", "pending_payment")).toBe(false);
    expect(canTransition("refunded", "confirmed")).toBe(false);
    for (const s of BOOKING_STATUSES) expect(canTransition(s, "draft")).toBe(false);
  });

  it("lets customers cancel confirmed stays before check-in", () => {
    const checkIn = new Date("2026-11-10T06:30:00Z");
    expect(customerCanCancel("confirmed", checkIn, new Date("2026-11-09T00:00:00Z"))).toBe(true);
    expect(customerCanCancel("confirmed", checkIn, new Date("2026-11-10T07:00:00Z"))).toBe(false);
    expect(customerCanCancel("pending_payment", checkIn, new Date("2026-11-09T00:00:00Z"))).toBe(false);
  });

  it("generates readable booking codes", () => {
    let i = 0;
    const code = generateBookingCode(() => i++ % 32);
    expect(code).toMatch(/^PS[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(code).toBe("PS01234567");
    expect(balanceDue({ totalPaise: 100, paidPaise: 30 })).toBe(70);
  });
});

describe("payment signatures", () => {
  const secret = "test_secret";
  it("verifies checkout callbacks", () => {
    const signature = hmacHex(secret, "order_1|pay_1");
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature }, secret)).toBe(true);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature }, secret)).toBe(false);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "zz" }, secret)).toBe(
      false,
    );
  });

  it("verifies webhook bodies byte for byte", () => {
    const body = '{"event":"payment.captured"}';
    const signature = hmacHex(secret, body);
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(body, signature, "other")).toBe(false);
  });
});
