import "server-only";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateCoupon, type BookingService, type Coupon, type CouponRejection } from "./engine";

/**
 * Loads a coupon and the caller's usage and asks the engine whether it
 * applies. Shared by every checkout; the booking function re-checks the
 * limits under a row lock.
 */

type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  value: number;
  max_discount_paise: number | null;
  min_order_paise: number;
  services: Coupon["services"];
  hotel_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number;
  first_booking_only: boolean;
  is_active: boolean;
};

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    value: row.value,
    maxDiscountPaise: row.max_discount_paise,
    minOrderPaise: row.min_order_paise,
    services: row.services,
    hotelIds: row.hotel_ids,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    usageLimit: row.usage_limit,
    perUserLimit: row.per_user_limit,
    firstBookingOnly: row.first_booking_only,
    isActive: row.is_active,
  };
}

export async function checkCoupon(
  code: string,
  ctx: { service: BookingService; hotelId: string | null; basePaise: number; userId: string | null },
): Promise<{
  coupon: { id: string; code: string; discountPaise: number } | null;
  error: CouponRejection | null;
}> {
  if (!hasServiceRole()) return { coupon: null, error: "not_found" };
  const admin = createAdminClient();
  const { data } = await admin.from("coupons").select("*").eq("code", code).maybeSingle();
  if (!data) return { coupon: null, error: "not_found" };
  const live = ["reserved", "redeemed"] as const;
  const [used, userUsed, prior] = await Promise.all([
    admin
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", data.id)
      .in("status", live),
    ctx.userId
      ? admin
          .from("coupon_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", data.id)
          .eq("user_id", ctx.userId)
          .in("status", live)
      : Promise.resolve({ count: 0 }),
    ctx.userId
      ? admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ctx.userId)
          .in("status", ["confirmed", "completed", "partially_refunded"])
      : Promise.resolve({ count: 0 }),
  ]);
  const result = evaluateCoupon(toCoupon(data), {
    service: ctx.service,
    hotelId: ctx.hotelId,
    basePaise: ctx.basePaise,
    now: new Date(),
    usedCount: used.count ?? 0,
    userUsedCount: userUsed.count ?? 0,
    userHasPriorBooking: (prior.count ?? 0) > 0,
  });
  return result.ok
    ? { coupon: { id: data.id, code: data.code, discountPaise: result.discountPaise }, error: null }
    : { coupon: null, error: result.reason };
}
