import "server-only";
import { randomInt } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { razorpayConfig, type RazorpayConfig } from "@/lib/env.server";
import { HOTEL_CALENDAR_TAG } from "@/lib/hotels/queries";
import { formatPaise } from "@/lib/money";
import { notify } from "@/lib/notifications/service";
import {
  RazorpayError,
  capturePayment,
  createOrder,
  refundPayment,
  type RazorpayPayment,
} from "@/lib/payments/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";
import { generateBookingCode } from "./state";
import type { CheckoutQuote } from "./hotel-checkout";

/**
 * Booking writes. Everything here runs with the service role after the
 * caller has been authorised; the SQL functions do the locking and keep the
 * money columns consistent.
 */

export type Booking = Tables<"bookings">;

const DB_ERRORS = [
  "sold_out",
  "closed",
  "room_inactive",
  "hotel_unavailable",
  "totals_mismatch",
  "coupon_invalid",
  "coupon_exhausted",
  "coupon_used",
  "coupon_first_booking",
  "invalid_transition",
  "refund_exceeds_paid",
  "overpaid",
  "not_found",
  "cab_unavailable",
  "payment_mode",
  "driver_unavailable",
  "vehicle_unavailable",
  "otp_mismatch",
] as const;
export type BookingDbError = (typeof DB_ERRORS)[number];

export class BookingError extends Error {
  constructor(readonly code: BookingDbError | "payment_failed" | "unknown") {
    super(code);
  }
}

export function dbError(error: { message: string; code?: string }): BookingError {
  const known = DB_ERRORS.find((c) => error.message.includes(c));
  if (!known) console.error("[bookings] database error", error);
  return new BookingError(known ?? "unknown");
}

export const createdSchema = z.object({ id: z.uuid(), code: z.string(), status: z.string() });
const paymentResultSchema = z.object({
  result: z.enum([
    "confirmed",
    "recorded",
    "duplicate",
    "no_inventory",
    "not_payable",
    "unknown_order",
    "amount_mismatch",
  ]),
  booking_id: z.uuid().optional(),
  payment_id: z.uuid().optional(),
});
export type PaymentOutcome = z.infer<typeof paymentResultSchema>["result"];

export type GuestDetails = {
  name: string;
  email: string;
  phone: string;
  guests: string[];
  specialRequests: string;
  gst: { gstin: string; company: string; address: string } | null;
};

export type CreatedBooking =
  | { code: string; status: "confirmed" }
  | {
      code: string;
      status: "pending_payment";
      order: { id: string; amountPaise: number; keyId: string };
    };

/** Writes the booking, holds the rooms and (for online payment) opens a Razorpay order. */
export async function createHotelBooking(
  checkout: CheckoutQuote,
  guest: GuestDetails,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const { hotel, room, plan, stay, quote, price } = checkout;
  const expiresAt = new Date(Date.now() + checkout.holdMinutes * 60_000).toISOString();
  const otherGuests = guest.guests.filter((g) => g.length >= 2);

  const booking = {
    user_id: userId,
    hotel_id: hotel.id,
    room_id: room.id,
    check_in: stay.checkIn,
    check_out: stay.checkOut,
    rooms: stay.rooms,
    adults: stay.adults,
    children: stay.children,
    contact_name: guest.name,
    contact_email: guest.email,
    contact_phone: guest.phone,
    special_requests: guest.specialRequests,
    gst_details: guest.gst,
    subtotal_paise: price.subtotalPaise,
    discount_paise: price.discountPaise,
    tax_paise: price.taxPaise,
    total_paise: price.totalPaise,
    payable_now_paise: checkout.payableNowPaise,
    payment_mode: checkout.paymentMode,
    coupon_id: checkout.coupon?.id ?? null,
    coupon_code: checkout.coupon?.code ?? null,
    locale,
    expires_at: expiresAt,
    price_breakdown: {
      lines: price.lines,
      roomChargesPaise: quote.roomChargesPaise,
      extraGuestPaise: quote.extraGuestPaise,
      nights: quote.nights.length,
      advancePercent: checkout.paymentMode === "part" ? checkout.options.advancePercent : null,
    },
    snapshot: {
      hotel: {
        id: hotel.id,
        slug: hotel.slug,
        name: hotel.name,
        address: hotel.address,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
        policies: hotel.policies,
      },
      room: { id: room.id, name: room.name },
      plan: {
        id: plan.id,
        name: plan.name,
        mealPlan: plan.mealPlan,
        inclusions: plan.inclusions,
        isRefundable: plan.isRefundable,
        cancellationRules: plan.cancellationRules,
      },
    },
  };
  const items = price.lines.map((l) => ({
    kind: l.kind,
    line_key: l.key,
    description: l.description,
    service_date: l.date,
    room_id: l.roomId,
    rate_plan_id: l.ratePlanId,
    quantity: l.quantity,
    amount_paise: l.amountPaise,
    discount_paise: l.discountPaise,
    tax_rate_bps: l.taxRateBps,
    tax_paise: l.taxPaise,
    sac: l.sac,
  }));
  const guests = [
    { full_name: guest.name, is_primary: true },
    ...otherGuests.map((name) => ({ full_name: name, is_primary: false })),
  ];

  let created: z.infer<typeof createdSchema> | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateBookingCode(randomInt);
    const { data, error } = await admin.rpc("create_hotel_booking", {
      p_booking: { ...booking, code },
      p_items: items,
      p_guests: guests,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
      throw dbError(error);
    }
    created = createdSchema.parse(data);
  }
  if (!created) throw new BookingError("unknown");
  revalidateTag(HOTEL_CALENDAR_TAG);

  if (created.status === "confirmed") {
    await notifyBooking(created.id, "booking.confirmed");
    return { code: created.code, status: "confirmed" };
  }

  return openPaymentOrder(created, checkout.payableNowPaise, userId, { hotel: hotel.slug });
}

/**
 * Opens the Razorpay order for a new unpaid booking. If that fails the
 * booking is marked failed at once so it stops holding anything.
 */
export async function openPaymentOrder(
  created: { id: string; code: string },
  amountPaise: number,
  userId: string,
  notes: Record<string, string>,
): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const config = razorpayConfig();
  try {
    if (!config) throw new BookingError("payment_failed");
    const order = await createOrder(config, {
      amountPaise,
      receipt: created.code,
      notes: { booking: created.code, ...notes },
    });
    const { error } = await admin.rpc("attach_payment_order", {
      p_booking_id: created.id,
      p_order_id: order.id,
      p_amount: amountPaise,
    });
    if (error) throw dbError(error);
    return {
      code: created.code,
      status: "pending_payment",
      order: { id: order.id, amountPaise: order.amount, keyId: config.keyId },
    };
  } catch (error) {
    console.error("[bookings] could not open payment", error);
    await admin.rpc("cancel_booking", {
      p_booking_id: created.id,
      p_actor: userId,
      p_reason: "payment order failed",
      p_to: "failed",
    });
    revalidateTag(HOTEL_CALENDAR_TAG);
    throw new BookingError("payment_failed");
  }
}

/**
 * Applies a Razorpay payment we have verified (signature or webhook):
 * captures it if only authorised, records it, and refunds it at once when
 * the booking can no longer be honoured.
 */
export async function applyRazorpayPayment(
  config: RazorpayConfig,
  payment: RazorpayPayment,
  link?: { paymentLinkId: string },
): Promise<PaymentOutcome> {
  const admin = createAdminClient();
  let current = payment;
  if (current.status === "authorized") {
    try {
      current = await capturePayment(config, current.id, current.amount);
    } catch (error) {
      // Already captured elsewhere (webhook vs. callback race): re-read it.
      if (!(error instanceof RazorpayError)) throw error;
    }
  }
  const status =
    current.status === "captured" ? "captured" : current.status === "failed" ? "failed" : "authorized";
  const { data, error } = await admin.rpc("record_payment", {
    p: {
      order_id: link ? null : (current.order_id ?? null),
      payment_link_id: link?.paymentLinkId ?? null,
      payment_id: current.id,
      status,
      amount_paise: current.amount,
      method: current.method ?? null,
      error_code: current.error_code ?? null,
      error_description: current.error_description ?? null,
      raw: current,
    },
  });
  if (error) throw dbError(error);
  const outcome = paymentResultSchema.parse(data);

  if (outcome.result === "confirmed" && outcome.booking_id) {
    revalidateTag(HOTEL_CALENDAR_TAG);
    await notifyBooking(outcome.booking_id, "booking.confirmed");
  }
  if ((outcome.result === "no_inventory" || outcome.result === "not_payable") && outcome.booking_id) {
    await refundToGuest(outcome.booking_id, current.amount, null, `auto refund: ${outcome.result}`);
  }
  return outcome.result;
}

/**
 * Refunds `amountPaise` across the booking's captured payments, newest
 * first. Razorpay payments are refunded through Razorpay; offline payments
 * are recorded as refunded by staff. Returns the amount refunded.
 */
export async function refundToGuest(
  bookingId: string,
  amountPaise: number,
  actor: string | null,
  reason: string,
): Promise<number> {
  if (amountPaise <= 0) return 0;
  const admin = createAdminClient();
  const [{ data: payments }, { data: refunds }] = await Promise.all([
    admin
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .in("status", ["captured", "partially_refunded"])
      .order("captured_at", { ascending: false }),
    admin.from("refunds").select("payment_id, amount_paise, status").eq("booking_id", bookingId),
  ]);
  const config = razorpayConfig();
  let left = amountPaise;
  for (const payment of payments ?? []) {
    if (left <= 0) break;
    const already = (refunds ?? [])
      .filter((r) => r.payment_id === payment.id && r.status !== "failed")
      .reduce((s, r) => s + r.amount_paise, 0);
    const amount = Math.min(left, payment.amount_paise - already);
    if (amount <= 0) continue;

    let providerRefund: { id: string; status: "pending" | "processed" | "failed" } | null = null;
    if (payment.provider === "razorpay") {
      if (!config || !payment.provider_payment_id) throw new BookingError("payment_failed");
      providerRefund = await refundPayment(config, payment.provider_payment_id, {
        amountPaise: amount,
        receipt: `${bookingId.slice(0, 8)}-${Date.now()}`,
        notes: { booking: bookingId, reason: reason.slice(0, 200) },
      });
    }
    const { error } = await admin.rpc("record_refund", {
      p: {
        payment_id: payment.id,
        amount_paise: amount,
        provider_refund_id: providerRefund?.id ?? null,
        status: providerRefund ? providerRefund.status : "processed",
        reason,
        actor,
        raw: providerRefund,
      },
    });
    if (error) throw dbError(error);
    left -= amount;
  }
  return amountPaise - left;
}

/** Cancels a booking, returns its rooms, refunds `refundPaise` and tells the guest. */
export async function cancelWithRefund(input: {
  bookingId: string;
  actor: string;
  reason: string;
  refundPaise: number;
}): Promise<{ refundedPaise: number }> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("cancel_booking", {
    p_booking_id: input.bookingId,
    p_actor: input.actor,
    p_reason: input.reason,
  });
  if (error) throw dbError(error);
  revalidateTag(HOTEL_CALENDAR_TAG);
  const refunded = await refundToGuest(input.bookingId, input.refundPaise, input.actor, input.reason);
  await notifyBooking(input.bookingId, "booking.cancelled", { refund: refunded });
  return { refundedPaise: refunded };
}

type CabTripValues = Pick<
  Tables<"trips">,
  | "pickup_at"
  | "pickup_address"
  | "pickup_otp"
  | "driver_name"
  | "driver_phone"
  | "vehicle_label"
  | "vehicle_registration"
>;

/** Pickup time as customers read it, in India time. */
function formatPickup(iso: string, locale: "en" | "hi"): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function bookingValues(
  b: Booking,
  extra: { refund?: number; amount?: number; link?: string },
  trip: CabTripValues | null,
) {
  const snapshot = b.snapshot as {
    hotel?: { name?: { en?: string; hi?: string | null } };
    trip?: { label?: string; route?: string; vehicle?: string };
  };
  const locale = b.locale;
  const hotelName = (locale === "hi" ? snapshot.hotel?.name?.hi : null) || snapshot.hotel?.name?.en || "";
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    name: b.contact_name,
    code: b.code,
    // Generic templates (cancelled, payment link) say "at {{hotel}}"; for cabs that is the trip.
    hotel: hotelName || snapshot.trip?.label || "",
    check_in: b.check_in,
    check_out: b.check_out,
    rooms: b.rooms,
    guests: (b.adults ?? 0) + b.children,
    total: formatPaise(b.total_paise, locale),
    paid: formatPaise(b.paid_paise, locale),
    balance: formatPaise(Math.max(0, b.total_paise - b.paid_paise), locale),
    refund: extra.refund === undefined ? "" : formatPaise(extra.refund, locale),
    amount: extra.amount === undefined ? "" : formatPaise(extra.amount, locale),
    link: extra.link ?? "",
    trip_url: `${site}${locale === "hi" ? "/hi" : ""}/account/trips/${b.code}`,
    route: snapshot.trip?.route ?? "",
    vehicle: trip?.vehicle_label || snapshot.trip?.vehicle || "",
    pickup_at: trip ? formatPickup(trip.pickup_at, locale) : "",
    pickup_address: trip?.pickup_address ?? "",
    otp: trip?.pickup_otp ?? "",
    driver: trip?.driver_name ?? "",
    driver_phone: trip?.driver_phone ?? "",
    registration: trip?.vehicle_registration ?? "",
  };
}

/** Booking notifications. Cab bookings get their own confirmation template. */
export async function notifyBooking(
  bookingId: string,
  key: string,
  extra: { refund?: number; amount?: number; link?: string } = {},
): Promise<void> {
  const admin = createAdminClient();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) return;
  const { data: trip } =
    booking.service === "cab"
      ? await admin
          .from("trips")
          .select(
            "pickup_at, pickup_address, pickup_otp, driver_name, driver_phone, vehicle_label, vehicle_registration",
          )
          .eq("booking_id", bookingId)
          .maybeSingle()
      : { data: null };
  await notify({
    key: booking.service === "cab" && key === "booking.confirmed" ? "cab.confirmed" : key,
    locale: booking.locale,
    to: { email: booking.contact_email, phone: booking.contact_phone, userId: booking.user_id },
    values: bookingValues(booking, extra, trip),
    bookingId,
  });
}

/** Opportunistic cleanup so held rooms free up even between cron runs. */
export async function expireStaleBookings(): Promise<void> {
  const { data } = await createAdminClient().rpc("expire_stale_bookings");
  if (typeof data === "number" && data > 0) revalidateTag(HOTEL_CALENDAR_TAG);
}
