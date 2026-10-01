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
import { createAdminClient } from "@/lib/supabase/admin";
import type { CabPassenger } from "@/schemas/cabs";
import type { CabCheckoutQuote } from "./checkout";
import { tripLabel } from "./search";
import { indiaDate } from "./time";

/**
 * Cab booking writes, run with the service role after the caller has been
 * authorised. The SQL function writes the booking, lines, coupon hold and
 * trip in one transaction.
 */

export async function createCabBooking(
  checkout: CabCheckoutQuote,
  passenger: CabPassenger,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const { plan, category, price, inclusions, settings } = checkout;
  const featured = category.models.find((m) => m.isFeatured) ?? category.models[0];
  const route = plan.route?.name?.en ?? tripLabel(plan, category).split(" · ").slice(1).join(" · ");

  const booking = {
    user_id: userId,
    check_in: indiaDate(plan.pickupAt),
    check_out: plan.returnAt ? indiaDate(plan.returnAt) : null,
    adults: plan.passengers,
    contact_name: passenger.name,
    contact_email: passenger.email,
    contact_phone: passenger.phone,
    special_requests: passenger.notes ?? "",
    gst_details: null,
    subtotal_paise: price.subtotalPaise,
    discount_paise: price.discountPaise,
    tax_paise: price.taxPaise,
    total_paise: price.totalPaise,
    payable_now_paise: checkout.payableNowPaise,
    payment_mode: checkout.paymentMode,
    coupon_id: checkout.coupon?.id ?? null,
    coupon_code: checkout.coupon?.code ?? null,
    locale,
    expires_at: new Date(Date.now() + settings.hold_minutes * 60_000).toISOString(),
    price_breakdown: {
      lines: price.lines,
      advancePercent: checkout.paymentMode === "part" ? settings.advance_percent : null,
    },
    snapshot: {
      trip: {
        type: plan.tripType,
        label: tripLabel(plan, category),
        route,
        vehicle: featured ? `${featured.name} or similar` : category.name.en,
        from: { slug: plan.from.slug, name: plan.from.name },
        to: plan.to ? { slug: plan.to.slug, name: plan.to.name } : null,
        routeSlug: plan.route?.slug ?? null,
        packageKey: plan.pkg?.key ?? null,
        pickupAt: plan.pickupAt.toISOString(),
        returnAt: plan.returnAt?.toISOString() ?? null,
        distanceKm: plan.distanceKm,
        durationMinutes: plan.durationMinutes,
        stops: plan.route?.stops ?? [],
      },
      category: { id: category.id, key: category.key, name: category.name, seats: category.seats },
      inclusions,
      addons: checkout.selectedAddons,
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
  const trip = {
    trip_type: plan.tripType,
    category_id: category.id,
    route_id: plan.route?.id ?? null,
    package_id: plan.pkg?.id ?? null,
    pickup_place_id: plan.from.id,
    drop_place_id: plan.to?.id ?? null,
    pickup_address: passenger.pickupAddress,
    drop_address: passenger.dropAddress ?? null,
    stops: plan.route?.stops ?? [],
    pickup_at: plan.pickupAt.toISOString(),
    return_at: plan.returnAt?.toISOString() ?? null,
    passengers: plan.passengers,
    distance_km: plan.distanceKm,
  };

  let created: z.infer<typeof createdSchema> | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateBookingCode(randomInt);
    const { data, error } = await admin.rpc("create_cab_booking", {
      p_booking: { ...booking, code },
      p_items: items,
      p_trip: trip,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
      throw dbError(error);
    }
    created = createdSchema.parse(data);
  }
  if (!created) throw new BookingError("unknown");
  return openPaymentOrder(created, checkout.payableNowPaise, userId, { cab: category.key });
}

/** Tells the customer who is coming. Called after (re)assignment. */
export async function notifyTripAssigned(tripId: string): Promise<void> {
  const { data } = await createAdminClient()
    .from("trips")
    .select("booking_id")
    .eq("id", tripId)
    .maybeSingle();
  if (data) await notifyBooking(data.booking_id, "trip.assigned");
}
