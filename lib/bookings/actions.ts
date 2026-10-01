"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { fetchPayment } from "@/lib/payments/razorpay";
import { verifyPaymentSignature } from "@/lib/payments/signature";
import { checkInInstant, quoteRefund } from "@/lib/refunds/policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  bookHotelSchema,
  bookingCodeSchema,
  hotelCheckoutSchema,
  verifyPaymentSchema,
} from "@/schemas/booking";
import { prepareHotelCheckout, type CheckoutError } from "./hotel-checkout";
import { toPreview, type CheckoutPreview, type PreviewResult } from "./preview";
import {
  BookingError,
  applyRazorpayPayment,
  cancelWithRefund,
  createHotelBooking,
  expireStaleBookings,
  type BookingDbError,
} from "./service";
import { customerCanCancel, type BookingStatus } from "./state";
import { getPaymentSettings } from "./settings";

/**
 * Customer checkout actions. Inputs are re-parsed here; the price is always
 * recomputed from the database, never read from the browser.
 */

export async function previewHotelCheckout(input: unknown): Promise<PreviewResult> {
  const parsed = hotelCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  const result = await prepareHotelCheckout(parsed.data, session?.user.id ?? null);
  return result.ok ? toPreview(result) : result;
}

export type BookError =
  | CheckoutError
  | BookingDbError
  | "signin"
  | "forbidden"
  | "invalid"
  | "coupon"
  | "payment_mode"
  | "price_changed"
  | "payment_failed"
  | "unknown";

export type BookResult =
  | { ok: true; code: string; status: "confirmed" }
  | {
      ok: true;
      code: string;
      status: "pending_payment";
      order: { id: string; amountPaise: number; keyId: string };
      prefill: { name: string; email: string; contact: string };
    }
  | { ok: false; error: BookError; field?: string; preview?: CheckoutPreview };

const bookInputSchema = bookHotelSchema.extend({ expectedTotalPaise: z.number().int().nonnegative() });

export async function bookHotel(input: unknown): Promise<BookResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = bookInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const { checkout: request, guest } = parsed.data;

  await expireStaleBookings().catch(() => undefined);
  const checkout = await prepareHotelCheckout(request, session.user.id);
  if (!checkout.ok) return { ok: false, error: checkout.error };
  if (request.coupon && checkout.couponError)
    return { ok: false, error: "coupon", preview: toPreview(checkout) };
  if (checkout.paymentMode !== request.paymentMode) return { ok: false, error: "payment_mode" };
  // The guest must pay exactly what they were shown; if a rate or coupon changed meanwhile, show the new price first.
  if (checkout.price.totalPaise !== parsed.data.expectedTotalPaise) {
    return { ok: false, error: "price_changed", preview: toPreview(checkout) };
  }

  try {
    const created = await createHotelBooking(
      checkout,
      {
        name: guest.name,
        email: guest.email || session.user.email || "",
        phone: guest.phone,
        guests: guest.guests,
        specialRequests: guest.specialRequests,
        gst: guest.wantsGst && guest.gst ? guest.gst : null,
      },
      session.user.id,
      request.locale,
    );
    revalidatePath("/[locale]/account", "layout");
    if (created.status === "confirmed") return { ok: true, code: created.code, status: "confirmed" };
    return {
      ok: true,
      code: created.code,
      status: "pending_payment",
      order: created.order,
      prefill: { name: guest.name, email: guest.email || session.user.email || "", contact: guest.phone },
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.code };
    console.error("[bookings] bookHotel failed", error);
    return { ok: false, error: "unknown" };
  }
}

export type VerifyResult =
  | { ok: true; status: "confirmed" | "processing" | "refunded" }
  | { ok: false; error: "signin" | "invalid" | "signature" | "not_found" | "payment_failed" };

/**
 * The browser's Razorpay callback. Only speeds up confirmation: the webhook
 * applies the same payment idempotently even if this never arrives.
 */
export async function verifyHotelPayment(input: unknown): Promise<VerifyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = verifyPaymentSchema.safeParse(input);
  const config = razorpayConfig();
  if (!parsed.success || !config) return { ok: false, error: "invalid" };
  const { bookingCode, razorpay_order_id: orderId, razorpay_payment_id: paymentId } = parsed.data;
  if (
    !verifyPaymentSignature(
      { orderId, paymentId, signature: parsed.data.razorpay_signature },
      config.keySecret,
    )
  ) {
    return { ok: false, error: "signature" };
  }

  // The booking must be the caller's, and the order must belong to it.
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id")
    .eq("code", bookingCode)
    .maybeSingle();
  if (!booking || booking.user_id !== session.user.id) return { ok: false, error: "not_found" };
  const { data: order } = await createAdminClient()
    .from("payments")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "not_found" };

  try {
    const payment = await fetchPayment(config, paymentId);
    if (payment.order_id !== orderId) return { ok: false, error: "invalid" };
    const outcome = await applyRazorpayPayment(config, payment);
    revalidatePath("/[locale]/account", "layout");
    if (outcome === "confirmed" || outcome === "duplicate" || outcome === "recorded") {
      return { ok: true, status: outcome === "recorded" ? "processing" : "confirmed" };
    }
    if (outcome === "no_inventory" || outcome === "not_payable") return { ok: true, status: "refunded" };
    return { ok: false, error: "payment_failed" };
  } catch (error) {
    console.error("[bookings] verify failed", error);
    return { ok: false, error: "payment_failed" };
  }
}

export type CancelResult =
  | { ok: true; refundPaise: number }
  | { ok: false; error: "signin" | "not_found" | "not_allowed" | "refund_failed" };

/** Self-service cancellation of a confirmed stay, refunded per the plan's policy. */
export async function cancelMyBooking(input: unknown): Promise<CancelResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = bookingCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_found" };
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (!booking || booking.user_id !== session.user.id || !booking.check_in)
    return { ok: false, error: "not_found" };

  const settings = await getPaymentSettings();
  const snapshot = booking.snapshot as {
    hotel?: { checkInTime?: string };
    plan?: { isRefundable?: boolean; cancellationRules?: { hours_before: number; refund_percent: number }[] };
  };
  const checkInAt = checkInInstant(booking.check_in, snapshot.hotel?.checkInTime ?? "12:00");
  const now = new Date();
  if (
    !settings.customer_cancellation_enabled ||
    !customerCanCancel(booking.status as BookingStatus, checkInAt, now)
  ) {
    return { ok: false, error: "not_allowed" };
  }
  const refund = quoteRefund({
    rules: snapshot.plan?.cancellationRules ?? [],
    isRefundable: snapshot.plan?.isRefundable ?? false,
    checkInAt,
    now,
    totalPaise: booking.total_paise,
    paidPaise: booking.paid_paise,
    refundedPaise: booking.refunded_paise,
  });
  try {
    const { refundedPaise } = await cancelWithRefund({
      bookingId: booking.id,
      actor: session.user.id,
      reason: "Cancelled by guest",
      refundPaise: refund.refundPaise,
    });
    revalidatePath("/[locale]/account", "layout");
    return { ok: true, refundPaise: refundedPaise };
  } catch (error) {
    console.error("[bookings] cancel failed", error);
    return {
      ok: false,
      error:
        error instanceof BookingError && error.code === "invalid_transition"
          ? "not_allowed"
          : "refund_failed",
    };
  }
}

export type ResumeResult =
  | {
      ok: true;
      order: { id: string; amountPaise: number; keyId: string };
      prefill: { name: string; email: string; contact: string };
    }
  | { ok: false; error: "signin" | "not_found" | "expired" };

/** Re-opens Razorpay for an unpaid booking while its rooms are still held. */
export async function resumeHotelPayment(input: unknown): Promise<ResumeResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = bookingCodeSchema.safeParse(input);
  const config = razorpayConfig();
  if (!parsed.success || !config) return { ok: false, error: "not_found" };
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, status, expires_at, contact_name, contact_email, contact_phone")
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (!booking || booking.user_id !== session.user.id) return { ok: false, error: "not_found" };
  if (
    booking.status !== "pending_payment" ||
    !booking.expires_at ||
    Date.parse(booking.expires_at) <= Date.now()
  ) {
    return { ok: false, error: "expired" };
  }
  const { data: order } = await supabase
    .from("payments")
    .select("provider_order_id, amount_paise")
    .eq("booking_id", booking.id)
    .eq("provider", "razorpay")
    .not("provider_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.provider_order_id) return { ok: false, error: "not_found" };
  return {
    ok: true,
    order: { id: order.provider_order_id, amountPaise: order.amount_paise, keyId: config.keyId },
    prefill: {
      name: booking.contact_name,
      email: booking.contact_email ?? "",
      contact: booking.contact_phone,
    },
  };
}
