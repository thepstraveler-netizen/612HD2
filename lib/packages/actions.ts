"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { verifyHotelPayment, type BookResult, type VerifyResult } from "@/lib/bookings/actions";
import { BookingError, expireStaleBookings } from "@/lib/bookings/service";
import { hasServiceRole } from "@/lib/env.server";
import { packageCheckoutSchema, packageTravellersSchema } from "@/schemas/packages";
import {
  preparePackageCheckout,
  toPackagePreview,
  type PackageCheckoutError,
  type PackagePreviewResult,
} from "./checkout";
import { createPackageBooking } from "./service";

/**
 * Customer package booking. Inputs are re-parsed here and the price is
 * always recomputed on the server. Enquiries go through
 * lib/leads/actions.ts (submitEnquiry) instead.
 */

export async function previewPackageBooking(input: unknown): Promise<PackagePreviewResult> {
  const parsed = packageCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  const result = await preparePackageCheckout(parsed.data, session?.user.id ?? null);
  return result.ok ? toPackagePreview(result) : result;
}

export type PackageBookError = Exclude<BookResult, { ok: true }>["error"] | PackageCheckoutError;
export type PackageBookResult =
  | Extract<BookResult, { ok: true; status: "pending_payment" }>
  | {
      ok: false;
      error: PackageBookError;
      field?: string;
      preview?: Extract<PackagePreviewResult, { ok: true }>;
    };

const bookPackageSchema = z.object({
  checkout: packageCheckoutSchema,
  details: packageTravellersSchema,
  expectedTotalPaise: z.number().int().nonnegative(),
});

export async function bookPackage(input: unknown): Promise<PackageBookResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = bookPackageSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const { checkout: request, details } = parsed.data;

  await expireStaleBookings().catch(() => undefined);
  const checkout = await preparePackageCheckout(request, session.user.id);
  if (!checkout.ok) return { ok: false, error: checkout.error };
  if (!checkout.online) return { ok: false, error: "booking_closed" };
  if (request.coupon && checkout.couponError)
    return { ok: false, error: "coupon", preview: toPackagePreview(checkout) };
  if (checkout.paymentMode !== request.paymentMode) return { ok: false, error: "payment_mode" };
  if (checkout.price.totalPaise !== parsed.data.expectedTotalPaise) {
    return { ok: false, error: "price_changed", preview: toPackagePreview(checkout) };
  }

  try {
    const created = await createPackageBooking(checkout, details, session.user.id, request.locale);
    revalidatePath("/[locale]/account", "layout");
    revalidatePath(`/[locale]/packages/${checkout.pkg.slug}`, "page");
    if (created.status !== "pending_payment") return { ok: false, error: "unknown" };
    return {
      ok: true,
      code: created.code,
      status: "pending_payment",
      order: created.order,
      prefill: { name: details.name, email: details.email, contact: details.phone },
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.code };
    console.error("[packages] bookPackage failed", error);
    return { ok: false, error: "unknown" };
  }
}

/** Razorpay callback for package bookings; same checks as hotels (the booking must be the caller's). */
export async function verifyPackagePayment(input: unknown): Promise<VerifyResult> {
  return verifyHotelPayment(input);
}
