import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  BookingError,
  createdSchema,
  dbError,
  openPaymentOrder,
  type CreatedBooking,
} from "@/lib/bookings/service";
import { generateBookingCode } from "@/lib/bookings/state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PackageTravellers } from "@/schemas/packages";
import type { PackageCheckoutQuote } from "./checkout";

/**
 * Package booking writes, run with the service role after the caller has
 * been authorised. The SQL function re-checks seats under a lock and
 * writes the booking, lines, travellers, coupon hold and package row in
 * one transaction; the Razorpay order for the advance is opened after.
 */

export async function createPackageBooking(
  checkout: PackageCheckoutQuote,
  details: PackageTravellers,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const { pkg, departure, price } = checkout;
  const travellers = details.travellers
    .filter((t) => t.name.length >= 2)
    .map((t) => ({ name: t.name, age: t.age === "" ? null : t.age }));
  const label = pkg.title.en;
  const route = pkg.destinations.join(" · ");

  const booking = {
    user_id: userId,
    check_in: checkout.startDate,
    check_out: checkout.endDate,
    adults: checkout.adults,
    children: checkout.children,
    contact_name: details.name,
    contact_email: details.email || null,
    contact_phone: details.phone,
    special_requests: details.specialRequests,
    subtotal_paise: price.subtotalPaise,
    discount_paise: price.discountPaise,
    tax_paise: price.taxPaise,
    total_paise: price.totalPaise,
    payable_now_paise: checkout.payableNowPaise,
    payment_mode: checkout.paymentMode,
    coupon_id: checkout.coupon?.id ?? null,
    coupon_code: checkout.coupon?.code ?? null,
    locale,
    expires_at: new Date(Date.now() + checkout.settings.hold_minutes * 60_000).toISOString(),
    price_breakdown: {
      lines: price.lines,
      advancePercent: checkout.paymentMode === "part" ? checkout.advancePercent : null,
    },
    snapshot: {
      package: {
        id: pkg.id,
        slug: pkg.slug,
        title: pkg.title,
        days: pkg.days,
        nights: pkg.nights,
        destinations: pkg.destinations,
        startCity: pkg.startCity,
        inclusions: pkg.inclusions,
        exclusions: pkg.exclusions,
        departureId: departure?.id ?? null,
        startDate: checkout.startDate,
        endDate: checkout.endDate,
        pickupPoint: details.pickupPoint || null,
      },
      // Generic booking views and templates read `trip` (label, route).
      trip: { label, route, vehicle: "" },
      cancellationPolicy: checkout.settings.cancellation_policy,
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
  const packageRow = {
    package_id: pkg.id,
    departure_id: departure?.id ?? null,
    start_date: checkout.startDate,
    end_date: checkout.endDate,
    adults: checkout.adults,
    children: checkout.children,
    travellers,
    pickup_point: details.pickupPoint,
  };

  let created: z.infer<typeof createdSchema> | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateBookingCode(randomInt);
    const { data, error } = await admin.rpc("create_package_booking", {
      p_booking: { ...booking, code },
      p_items: items,
      p_package: packageRow,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
      throw dbError(error);
    }
    created = createdSchema.parse(data);
  }
  if (!created) throw new BookingError("unknown");
  return openPaymentOrder(created, checkout.payableNowPaise, userId, { package: pkg.slug });
}
