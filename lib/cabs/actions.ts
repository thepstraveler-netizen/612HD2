"use server";

import { otpAttemptAllowed } from "@/lib/bookings/otp-attempts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { verifyHotelPayment, type BookResult, type VerifyResult } from "@/lib/bookings/actions";
import { BookingError, expireStaleBookings } from "@/lib/bookings/service";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cabCheckoutSchema, cabPassengerSchema, driverStepSchema } from "@/schemas/cabs";
import { prepareCabCheckout, type CabCheckoutError } from "./checkout";
import { DRIVER_NEXT } from "./driver";
import { toCabPreview, type CabPreviewResult } from "./preview";
import { createCabBooking } from "./service";

/**
 * Customer cab checkout and the driver's trip steps. Inputs are re-parsed
 * here and the price is always recomputed on the server.
 */

export async function previewCabCheckout(input: unknown): Promise<CabPreviewResult> {
  const parsed = cabCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  const result = await prepareCabCheckout(parsed.data, session?.user.id ?? null);
  return result.ok ? toCabPreview(result) : result;
}

export type CabBookError = Exclude<BookResult, { ok: true }>["error"] | CabCheckoutError;
export type CabBookResult =
  | Extract<BookResult, { ok: true; status: "pending_payment" }>
  | { ok: false; error: CabBookError; field?: string; preview?: Extract<CabPreviewResult, { ok: true }> };

const bookCabSchema = z.object({
  checkout: cabCheckoutSchema,
  passenger: cabPassengerSchema,
  expectedTotalPaise: z.number().int().nonnegative(),
});

export async function bookCab(input: unknown): Promise<CabBookResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = bookCabSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const { checkout: request, passenger } = parsed.data;

  await expireStaleBookings().catch(() => undefined);
  const checkout = await prepareCabCheckout(request, session.user.id);
  if (!checkout.ok) return { ok: false, error: checkout.error };
  if (!checkout.online) return { ok: false, error: "booking_closed" };
  if (request.coupon && checkout.couponError)
    return { ok: false, error: "coupon", preview: toCabPreview(checkout) };
  if (checkout.paymentMode !== request.paymentMode) return { ok: false, error: "payment_mode" };
  if (checkout.price.totalPaise !== parsed.data.expectedTotalPaise) {
    return { ok: false, error: "price_changed", preview: toCabPreview(checkout) };
  }

  try {
    const created = await createCabBooking(checkout, passenger, session.user.id, request.locale);
    revalidatePath("/[locale]/account", "layout");
    if (created.status !== "pending_payment") return { ok: false, error: "unknown" };
    return {
      ok: true,
      code: created.code,
      status: "pending_payment",
      order: created.order,
      prefill: { name: passenger.name, email: passenger.email, contact: passenger.phone },
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.code };
    console.error("[cabs] bookCab failed", error);
    return { ok: false, error: "unknown" };
  }
}

/** Razorpay callback for cab bookings; same checks as hotels (the booking must be the caller's). */
export async function verifyCabPayment(input: unknown): Promise<VerifyResult> {
  return verifyHotelPayment(input);
}

export type DriverStepResult =
  | { ok: true; status: string }
  | { ok: false; error: "not_found" | "invalid" | "otp_mismatch" | "invalid_transition" | "unknown" };

/** A step from the driver's trip link. The token is the only credential. */
export async function driverStep(input: unknown): Promise<DriverStepResult> {
  const parsed = driverStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "not_found" };
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id, status, driver_token_expires_at")
    .eq("driver_token", parsed.data.token)
    .maybeSingle();
  if (!trip || !trip.driver_token_expires_at || Date.parse(trip.driver_token_expires_at) < Date.now()) {
    return { ok: false, error: "not_found" };
  }
  if (!DRIVER_NEXT[trip.status]?.includes(parsed.data.status))
    return { ok: false, error: "invalid_transition" };
  // Locked after too many tries; reported like a wrong code (D-098).
  if (parsed.data.otp && !(await otpAttemptAllowed("trip", trip.id)))
    return { ok: false, error: "otp_mismatch" };
  const { data, error } = await admin.rpc("set_trip_status", {
    p_trip_id: trip.id,
    p_status: parsed.data.status,
    p_actor: null,
    p_source: "driver",
    p_otp: parsed.data.otp ?? null,
  });
  if (error) {
    if (error.message.includes("otp_mismatch")) return { ok: false, error: "otp_mismatch" };
    if (error.message.includes("invalid_transition")) return { ok: false, error: "invalid_transition" };
    console.error("[cabs] driver step failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath(`/[locale]/driver/trip/${parsed.data.token}`, "page");
  return { ok: true, status: data?.status ?? parsed.data.status };
}
