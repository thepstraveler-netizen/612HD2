import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  BookingError,
  createdSchema,
  dbError,
  notifyBooking,
  openPaymentOrder,
  type CreatedBooking,
} from "@/lib/bookings/service";
import { generateBookingCode } from "@/lib/bookings/state";
import { indiaDate } from "@/lib/cabs/time";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RidePassenger } from "@/schemas/rides";
import type { RideCheckoutQuote } from "./checkout";
import { rideLabel, type RidePlace } from "./search";

/**
 * Ride booking writes, run with the service role after the caller has been
 * authorised. The SQL function writes the booking, lines, coupon hold and
 * ride request in one transaction; pay-the-driver rides come back confirmed.
 */

const placeName = (p: RidePlace) => p.point?.name ?? { en: "Current location", hi: "वर्तमान स्थान" };

export async function createRideBooking(
  checkout: RideCheckoutQuote,
  passenger: RidePassenger,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const { plan, type, price, settings, terms } = checkout;
  const label = rideLabel(plan, type);
  const route = label.split(" · ").slice(1).join(" · ");

  const booking = {
    user_id: userId,
    check_in: indiaDate(plan.pickupAt),
    adults: plan.passengers,
    contact_name: passenger.name,
    contact_email: passenger.email || null,
    contact_phone: passenger.phone,
    special_requests: passenger.notes ?? "",
    subtotal_paise: price.subtotalPaise,
    discount_paise: price.discountPaise,
    tax_paise: price.taxPaise,
    total_paise: price.totalPaise,
    payable_now_paise: checkout.payableNowPaise,
    payment_mode: checkout.pay === "online" ? "full" : "pay_at_hotel",
    coupon_id: checkout.coupon?.id ?? null,
    coupon_code: checkout.coupon?.code ?? null,
    locale,
    expires_at: new Date(Date.now() + settings.hold_minutes * 60_000).toISOString(),
    price_breakdown: { lines: price.lines },
    snapshot: {
      ride: {
        mode: plan.mode,
        label,
        vehicleType: { id: type.id, key: type.key, name: type.name, icon: type.icon },
        zone: { slug: plan.zone.slug, name: plan.zone.name },
        from: { slug: plan.pickup.point?.slug ?? null, name: placeName(plan.pickup) },
        to: plan.drop ? { slug: plan.drop.point?.slug ?? null, name: placeName(plan.drop) } : null,
        hours: plan.hours,
        pickupAt: plan.pickupAt.toISOString(),
        isNow: plan.isNow,
        distanceKm: plan.distanceKm,
        durationMinutes: plan.durationMinutes,
        instantBook: type.instantBook,
      },
      // Generic booking views read `trip` (label, route, vehicle) for cabs and rides alike.
      trip: { label, route, vehicle: type.name.en },
      terms,
      cancellationRules: settings.cancellation_rules,
    },
  };
  const items = price.lines.map((l) => ({
    kind: l.kind,
    line_key: l.key,
    description: l.description,
    service_date: l.date,
    quantity: l.quantity,
    amount_paise: l.amountPaise,
    discount_paise: l.discountPaise,
    tax_rate_bps: l.taxRateBps,
    tax_paise: l.taxPaise,
    sac: l.sac,
  }));
  const ride = {
    vehicle_type_id: type.id,
    zone_id: plan.zone.id,
    mode: plan.mode,
    pickup_point_id: plan.pickup.point?.id ?? null,
    pickup_lat: plan.pickup.lat,
    pickup_lng: plan.pickup.lng,
    pickup_address: passenger.pickupAddress,
    drop_point_id: plan.drop?.point?.id ?? null,
    drop_lat: plan.drop?.lat ?? null,
    drop_lng: plan.drop?.lng ?? null,
    drop_address: passenger.dropAddress ?? null,
    hours: plan.hours,
    pickup_at: plan.pickupAt.toISOString(),
    passengers: plan.passengers,
    distance_km: plan.distanceKm,
  };

  let created: z.infer<typeof createdSchema> | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateBookingCode(randomInt);
    const { data, error } = await admin.rpc("create_ride_booking", {
      p_booking: { ...booking, code },
      p_items: items,
      p_ride: ride,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
      throw dbError(error);
    }
    created = createdSchema.parse(data);
  }
  if (!created) throw new BookingError("unknown");
  if (created.status === "confirmed") {
    await notifyBooking(created.id, "booking.confirmed");
    return { code: created.code, status: "confirmed" };
  }
  return openPaymentOrder(created, checkout.payableNowPaise, userId, { ride: type.key });
}

/** Tells the customer who is coming. Called after (re)assignment. */
export async function notifyRideAssigned(rideId: string): Promise<void> {
  const { data } = await createAdminClient()
    .from("ride_requests")
    .select("booking_id")
    .eq("id", rideId)
    .maybeSingle();
  if (data) await notifyBooking(data.booking_id, "ride.assigned");
}
