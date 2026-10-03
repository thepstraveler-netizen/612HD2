"use server";

import { otpAttemptAllowed } from "@/lib/bookings/otp-attempts";
import { revalidatePath } from "next/cache";
import { BookingError } from "@/lib/bookings/service";
import { hasServiceRole } from "@/lib/env.server";
import { riderStepSchema } from "@/schemas/delivery-vendor";
import { orderByToken } from "./rider";
import { moveOrder } from "./service";
import { RIDER_NEXT } from "./vendor-ui";

export type RiderStepResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "invalid" | "otp_mismatch" | "invalid_transition" | "unknown" };

/** A step from the rider's order link (picked up, delivered with the OTP). The token is the only credential. */
export async function riderStep(input: unknown): Promise<RiderStepResult> {
  const parsed = riderStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "not_found" };
  const order = await orderByToken(parsed.data.token);
  if (!order) return { ok: false, error: "not_found" };
  if (!RIDER_NEXT[order.status]?.includes(parsed.data.status))
    return { ok: false, error: "invalid_transition" };
  // Locked after too many tries; reported like a wrong code (D-098).
  if (parsed.data.otp && !(await otpAttemptAllowed("order", order.id)))
    return { ok: false, error: "otp_mismatch" };
  try {
    await moveOrder({
      orderId: order.id,
      status: parsed.data.status,
      actor: null,
      source: "partner",
      otp: parsed.data.otp ?? null,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      if (error.code === "otp_mismatch") return { ok: false, error: "otp_mismatch" };
      if (error.code === "invalid_transition") return { ok: false, error: "invalid_transition" };
      if (error.code === "not_found") return { ok: false, error: "not_found" };
    }
    console.error("[delivery] rider step failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath(`/[locale]/delivery/order/${parsed.data.token}`, "page");
  return { ok: true };
}
