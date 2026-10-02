"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { verifyHotelPayment, type BookResult, type VerifyResult } from "@/lib/bookings/actions";
import { BookingError, expireStaleBookings } from "@/lib/bookings/service";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rateRideSchema,
  rideCheckoutSchema,
  rideDriverStepSchema,
  ridePassengerSchema,
} from "@/schemas/rides";
import { prepareRideCheckout, type RideCheckoutError } from "./checkout";
import { RIDE_DRIVER_NEXT, rideByToken } from "./driver";
import { toRidePreview, type RidePreviewResult } from "./preview";
import { createRideBooking } from "./service";

/**
 * Customer ride checkout, ratings and the driver's ride steps. Inputs are
 * re-parsed here and the price is always recomputed on the server.
 */

export async function previewRideCheckout(input: unknown): Promise<RidePreviewResult> {
  const parsed = rideCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  const result = await prepareRideCheckout(parsed.data, session?.user.id ?? null);
  return result.ok ? toRidePreview(result) : result;
}

export type RideBookError = Exclude<BookResult, { ok: true }>["error"] | RideCheckoutError;
export type RideBookResult =
  | Extract<BookResult, { ok: true }>
  | { ok: false; error: RideBookError; field?: string; preview?: Extract<RidePreviewResult, { ok: true }> };

const bookRideSchema = z.object({
  checkout: rideCheckoutSchema,
  passenger: ridePassengerSchema,
  expectedTotalPaise: z.number().int().nonnegative(),
});

export async function bookRide(input: unknown): Promise<RideBookResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = bookRideSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const { checkout: request, passenger } = parsed.data;

  await expireStaleBookings().catch(() => undefined);
  const checkout = await prepareRideCheckout(request, session.user.id);
  if (!checkout.ok) return { ok: false, error: checkout.error };
  if (request.coupon && checkout.couponError)
    return { ok: false, error: "coupon", preview: toRidePreview(checkout) };
  if (checkout.pay !== request.pay) return { ok: false, error: "payment_mode" };
  if (checkout.price.totalPaise !== parsed.data.expectedTotalPaise) {
    return { ok: false, error: "price_changed", preview: toRidePreview(checkout) };
  }

  try {
    const created = await createRideBooking(checkout, passenger, session.user.id, request.locale);
    revalidatePath("/[locale]/account", "layout");
    if (created.status === "confirmed") return { ok: true, code: created.code, status: "confirmed" };
    return {
      ok: true,
      code: created.code,
      status: "pending_payment",
      order: created.order,
      prefill: { name: passenger.name, email: passenger.email ?? "", contact: passenger.phone },
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.code };
    console.error("[rides] bookRide failed", error);
    return { ok: false, error: "unknown" };
  }
}

/** Razorpay callback for online rides; same checks as hotels (the booking must be the caller's). */
export async function verifyRidePayment(input: unknown): Promise<VerifyResult> {
  return verifyHotelPayment(input);
}

export type RateRideResult =
  { ok: true } | { ok: false; error: "signin" | "invalid" | "not_found" | "already_rated" | "unknown" };

/** The customer rates their completed ride, once. */
export async function rateRide(input: unknown): Promise<RateRideResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = rateRideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "not_found" };
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("code", parsed.data.code)
    .eq("user_id", session.user.id)
    .eq("service", "ride")
    .maybeSingle();
  if (!booking) return { ok: false, error: "not_found" };
  const { data: ride } = await admin
    .from("ride_requests")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (!ride) return { ok: false, error: "not_found" };
  const { error } = await admin.rpc("rate_ride", {
    p_ride_id: ride.id,
    p_user: session.user.id,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment,
  });
  if (error) {
    if (error.message.includes("invalid_transition")) return { ok: false, error: "already_rated" };
    if (error.message.includes("not_found")) return { ok: false, error: "not_found" };
    console.error("[rides] rating failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath(`/[locale]/account/trips/${parsed.data.code}`, "page");
  return { ok: true };
}

export type RideDriverStepResult =
  | { ok: true; status: string }
  | { ok: false; error: "not_found" | "invalid" | "otp_mismatch" | "invalid_transition" | "unknown" };

/** A step from the driver's ride link. The token is the only credential. */
export async function rideDriverStep(input: unknown): Promise<RideDriverStepResult> {
  const parsed = rideDriverStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "not_found" };
  const ride = await rideByToken(parsed.data.token);
  if (!ride) return { ok: false, error: "not_found" };
  if (!RIDE_DRIVER_NEXT[ride.status]?.includes(parsed.data.status))
    return { ok: false, error: "invalid_transition" };
  const { data, error } = await createAdminClient().rpc("set_ride_status", {
    p_ride_id: ride.id,
    p_status: parsed.data.status,
    p_actor: null,
    p_source: "driver",
    p_otp: parsed.data.otp ?? null,
  });
  if (error) {
    if (error.message.includes("otp_mismatch")) return { ok: false, error: "otp_mismatch" };
    if (error.message.includes("invalid_transition")) return { ok: false, error: "invalid_transition" };
    console.error("[rides] driver step failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath(`/[locale]/driver/ride/${parsed.data.token}`, "page");
  return { ok: true, status: data?.status ?? parsed.data.status };
}
