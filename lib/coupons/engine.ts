/**
 * Coupon eligibility and discount. Pure: the server loads the coupon and the
 * caller's usage counts, then asks this module. Limits are re-checked under a
 * row lock when the booking is written, so two tabs cannot both use a
 * single-use coupon.
 */

export type BookingService =
  "hotel" | "cab" | "ride" | "food" | "essentials" | "medicine" | "package" | "travel";

export type Coupon = {
  id: string;
  code: string;
  discountType: "percent" | "flat";
  /** percent: basis points; flat: paise. */
  value: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  /** Empty = all services / all hotels. */
  services: BookingService[];
  hotelIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number;
  firstBookingOnly: boolean;
  isActive: boolean;
  /** Personal coupon (P&S Rewards code): only this customer may use it. Null/absent = anyone. */
  ownerId?: string | null;
};

export type CouponContext = {
  service: BookingService;
  hotelId: string | null;
  /** Pre-tax amount the coupon applies to. */
  basePaise: number;
  now: Date;
  /** Live (reserved or redeemed) uses across all customers. */
  usedCount: number;
  userUsedCount: number;
  userHasPriorBooking: boolean;
  /** The signed-in customer, or null for a guest. */
  userId?: string | null;
};

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "service"
  | "hotel"
  | "min_order"
  | "exhausted"
  | "used"
  | "first_booking"
  /** Too many coupon lookups from this visitor (lib/coupons/check.ts, never from the engine). */
  | "rateLimited";

export type CouponResult = { ok: true; discountPaise: number } | { ok: false; reason: CouponRejection };

/** Codes are stored upper-case without spaces. */
export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function couponDiscount(coupon: Coupon, basePaise: number): number {
  const raw =
    coupon.discountType === "percent" ? Math.floor((basePaise * coupon.value) / 10_000) : coupon.value;
  const capped = coupon.maxDiscountPaise === null ? raw : Math.min(raw, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(capped, basePaise));
}

/**
 * A personal coupon works only for its owner; guests and everyone else are
 * told it does not exist, so a leaked code reveals nothing.
 */
export function canUseCoupon(ownerId: string | null | undefined, userId: string | null | undefined): boolean {
  return !ownerId || ownerId === userId;
}

export function evaluateCoupon(coupon: Coupon | null | undefined, ctx: CouponContext): CouponResult {
  if (!coupon) return { ok: false, reason: "not_found" };
  if (!canUseCoupon(coupon.ownerId, ctx.userId)) return { ok: false, reason: "not_found" };
  if (!coupon.isActive) return { ok: false, reason: "inactive" };
  const now = ctx.now.getTime();
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return { ok: false, reason: "not_started" };
  if (coupon.endsAt && Date.parse(coupon.endsAt) <= now) return { ok: false, reason: "expired" };
  if (coupon.services.length > 0 && !coupon.services.includes(ctx.service))
    return { ok: false, reason: "service" };
  if (coupon.hotelIds.length > 0 && (!ctx.hotelId || !coupon.hotelIds.includes(ctx.hotelId))) {
    return { ok: false, reason: "hotel" };
  }
  if (ctx.basePaise < coupon.minOrderPaise) return { ok: false, reason: "min_order" };
  if (coupon.usageLimit !== null && ctx.usedCount >= coupon.usageLimit)
    return { ok: false, reason: "exhausted" };
  if (ctx.userUsedCount >= coupon.perUserLimit) return { ok: false, reason: "used" };
  if (coupon.firstBookingOnly && ctx.userHasPriorBooking) return { ok: false, reason: "first_booking" };
  const discount = couponDiscount(coupon, ctx.basePaise);
  return discount > 0 ? { ok: true, discountPaise: discount } : { ok: false, reason: "min_order" };
}
