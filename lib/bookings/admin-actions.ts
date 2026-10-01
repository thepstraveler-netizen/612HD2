"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { mutate, type MutationResult, type Supabase } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { BookingError, cancelWithRefund, notifyBooking, refundToGuest } from "@/lib/bookings/service";
import { balanceDue } from "@/lib/bookings/state";
import { publicEnv } from "@/lib/env";
import { razorpayConfig } from "@/lib/env.server";
import { RazorpayError, createPaymentLink } from "@/lib/payments/razorpay";
import { hasPermission } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoiceSettingsSchema, paymentSettingsSchema } from "@/schemas/booking";
import type { Json } from "@/types/database";
import {
  bookingIdSchema,
  cancelBookingSchema,
  couponDeleteSchema,
  couponFormSchema,
  invoiceSettingsFormSchema,
  offlinePaymentSchema,
  paymentSettingsFormSchema,
  refundBookingSchema,
  templateFormSchema,
} from "@/schemas/booking-admin";
import { couponRow, mergeSettingValue, paymentSettingsValue, refundable } from "./admin-forms";

/**
 * Staff actions on bookings, payments, coupons, notification templates and
 * checkout settings.
 *
 * Booking and payment actions: assertPermission → zod → the service-role
 * SQL functions in lib/bookings/service.ts, which take the staff user as
 * `p_actor` so the audit log records who did it (bookings and payments have
 * no RLS write policies). Coupons, templates and settings go through
 * {@link mutate}: an RLS write as the user, audited by the table triggers.
 */

export type BookingActionResult = MutationResult | { ok: true; amountPaise: number };

const PAYMENT_LINK_DAYS = 7;

/** BookingError / provider failures → message keys under bookingsAdmin.errors. */
function errorKey(error: unknown): string {
  if (error instanceof BookingError) {
    switch (error.code) {
      case "invalid_transition":
        return "invalidTransition";
      case "refund_exceeds_paid":
        return "refundExceedsPaid";
      case "overpaid":
        return "overpaid";
      case "not_found":
        return "notFound";
      case "payment_failed":
        return "paymentFailed";
      default:
        return "actionFailed";
    }
  }
  if (error instanceof RazorpayError) return "paymentFailed";
  return "actionFailed";
}

/** Same matching as the service's dbError, for the RPCs this file calls directly. */
function rpcError(error: { message: string }): BookingError {
  for (const code of ["invalid_transition", "overpaid", "not_found"] as const) {
    if (error.message.includes(code)) return new BookingError(code);
  }
  console.error("[bookings admin] database error", error);
  return new BookingError("unknown");
}

function revalidateBookings() {
  revalidatePath("/[locale]/admin", "layout");
}

/**
 * Permission check, input validation and error mapping shared by every
 * booking action. `fn` runs only for an authorised, valid request.
 */
async function bookingAction<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, session: SessionContext) => Promise<BookingActionResult>,
): Promise<BookingActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  try {
    const result = await fn(parsed.data, session);
    if (result.ok) revalidateBookings();
    return result;
  } catch (error) {
    if (!(error instanceof BookingError)) console.error("[bookings admin] action failed", error);
    revalidateBookings();
    return { ok: false, error: errorKey(error) };
  }
}

async function loadBooking(id: string) {
  const { data, error } = await createAdminClient().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw rpcError(error);
  if (!data) throw new BookingError("not_found");
  return data;
}

// ---------------------------------------------------------------- bookings

/** Cancels, gives the rooms back and refunds what staff chose (≤ what is refundable). */
export async function cancelBookingAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("bookings.write", cancelBookingSchema, input, async (data, session) => {
    if (data.refund > 0 && !hasPermission(session.permissions, "payments.refund")) {
      return { ok: false, error: "forbidden" };
    }
    const booking = await loadBooking(data.bookingId);
    if (data.refund > refundable(booking)) return { ok: false, error: "refundExceedsPaid", field: "refund" };
    try {
      const { refundedPaise } = await cancelWithRefund({
        bookingId: booking.id,
        actor: session.user.id,
        reason: data.reason,
        refundPaise: data.refund,
      });
      return { ok: true, amountPaise: refundedPaise };
    } catch (error) {
      // The cancel and the refund are separate steps: say which one failed.
      const after = await loadBooking(booking.id).catch(() => null);
      if (after?.status === "cancelled" && data.refund > 0) {
        console.error("[bookings admin] cancelled but refund failed", error);
        return { ok: false, error: "cancelledRefundFailed" };
      }
      throw error;
    }
  });
}

/** Refund without cancelling (goodwill, overcharge). */
export async function refundBookingAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("payments.refund", refundBookingSchema, input, async (data, session) => {
    const booking = await loadBooking(data.bookingId);
    if (data.amount > refundable(booking)) return { ok: false, error: "refundExceedsPaid", field: "amount" };
    const refunded = await refundToGuest(booking.id, data.amount, session.user.id, data.reason);
    if (refunded === 0) return { ok: false, error: "nothingToRefund" };
    return { ok: true, amountPaise: refunded };
  });
}

export async function completeBookingAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("bookings.write", bookingIdSchema, input, async ({ bookingId }, session) => {
    const { error } = await createAdminClient().rpc("complete_booking", {
      p_booking_id: bookingId,
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    return { ok: true };
  });
}

/** Cash / UPI collected at the hotel or office. */
export async function recordOfflinePaymentAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("payments.write", offlinePaymentSchema, input, async (data, session) => {
    const booking = await loadBooking(data.bookingId);
    const balance = balanceDue({ totalPaise: booking.total_paise, paidPaise: booking.paid_paise });
    if (data.amount > balance) return { ok: false, error: "overpaid", field: "amount" };
    const { error } = await createAdminClient().rpc("record_offline_payment", {
      p_booking_id: booking.id,
      p_amount: data.amount,
      p_method: data.method,
      p_reference: data.reference,
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    return { ok: true, amountPaise: data.amount };
  });
}

/**
 * Sends the guest a Razorpay payment link for the balance. An unexpired
 * open link is sent again instead of opening a second one, so the guest can
 * never pay the balance twice. The webhook records `payment_link.paid`.
 */
export async function sendPaymentLinkAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("payments.write", bookingIdSchema, input, async ({ bookingId }, session) => {
    const config = razorpayConfig();
    if (!config) return { ok: false, error: "paymentsDisabled" };
    const admin = createAdminClient();
    const booking = await loadBooking(bookingId);
    if (booking.status !== "confirmed" && booking.status !== "completed") {
      return { ok: false, error: "invalidTransition" };
    }
    const balance = balanceDue({ totalPaise: booking.total_paise, paidPaise: booking.paid_paise });
    if (balance <= 0) return { ok: false, error: "nothingDue" };

    const since = new Date(Date.now() - PAYMENT_LINK_DAYS * 86_400_000).toISOString();
    const { data: open, error: openError } = await admin
      .from("payments")
      .select("amount_paise, payment_link_url")
      .eq("booking_id", booking.id)
      .eq("status", "created")
      .not("payment_link_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) throw rpcError(openError);
    if (open?.payment_link_url) {
      await notifyBooking(booking.id, "payment.link", {
        amount: open.amount_paise,
        link: open.payment_link_url,
      });
      return { ok: true, amountPaise: open.amount_paise };
    }

    const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const link = await createPaymentLink(config, {
      amountPaise: balance,
      // Unique per link (Razorpay rejects a reused reference_id).
      referenceId: `${booking.code}-${Date.now().toString(36).toUpperCase()}`,
      description: `Balance for booking ${booking.code}`,
      customer: { name: booking.contact_name, email: booking.contact_email, contact: booking.contact_phone },
      callbackUrl: `${site}/account/trips/${booking.code}`,
      expireBy: Math.floor(Date.now() / 1000) + PAYMENT_LINK_DAYS * 86_400,
      notes: { booking: booking.code },
    });
    const { error } = await admin.from("payments").insert({
      booking_id: booking.id,
      provider: "razorpay",
      payment_link_id: link.id,
      payment_link_url: link.short_url,
      amount_paise: balance,
      status: "created",
      recorded_by: session.user.id,
    });
    if (error) throw rpcError(error);
    await notifyBooking(booking.id, "payment.link", { amount: balance, link: link.short_url });
    return { ok: true, amountPaise: balance };
  });
}

export async function resendConfirmationAction(input: unknown): Promise<BookingActionResult> {
  return bookingAction("bookings.write", bookingIdSchema, input, async ({ bookingId }) => {
    const booking = await loadBooking(bookingId);
    if (booking.status !== "confirmed" && booking.status !== "completed") {
      return { ok: false, error: "invalidTransition" };
    }
    await notifyBooking(booking.id, "booking.confirmed");
    return { ok: true };
  });
}

// ---------------------------------------------------------------- coupons

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
/** PostgREST "no rows" for .single(). */
const NO_ROWS = "PGRST116";

export async function saveCoupon(input: unknown) {
  return mutate("offers.write", couponFormSchema, input, async (form, supabase) => {
    const row = couponRow(form);
    const { data, error } = form.id
      ? await supabase.from("coupons").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("coupons").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** Only a coupon nobody has used can be deleted; otherwise switch it off. */
export async function deleteCoupon(input: unknown) {
  return mutate("offers.write", couponDeleteSchema, input, async ({ id }, supabase) => {
    const { count, error } = await supabase
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", id)
      .in("status", ["reserved", "redeemed"]);
    if (error) return { error };
    if (count) return { error: inUse };
    return { error: (await supabase.from("coupons").delete().eq("id", id)).error };
  });
}

// ---------------------------------------------------------------- notification templates

export async function saveNotificationTemplate(input: unknown) {
  return mutate("notifications.write", templateFormSchema, input, async (form, supabase) => {
    const content = { subject: form.subject, body: form.body, is_active: form.is_active };
    // Key, channel and language identify a template; only a new one sets them.
    const { data, error } = form.id
      ? await supabase.from("notification_templates").update(content).eq("id", form.id).select("id").single()
      : await supabase
          .from("notification_templates")
          .insert({ ...content, key: form.key, channel: form.channel, locale: form.locale })
          .select("id")
          .single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

// ---------------------------------------------------------------- settings

/** Upserts a private settings row, keeping stored keys the form does not edit. */
async function upsertSetting(supabase: Supabase, key: string, value: { [key: string]: Json | undefined }) {
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) return { error };
  return {
    error: (
      await supabase
        .from("settings")
        .upsert({ key, value: mergeSettingValue(data?.value, value), is_public: false })
    ).error,
  };
}

export async function savePaymentSettings(input: unknown) {
  return mutate("settings.write", paymentSettingsFormSchema, input, async (form, supabase) => {
    const value = paymentSettingsSchema.safeParse(paymentSettingsValue(form));
    if (!value.success) return { error: { message: "invalid", code: "invalidContent" } };
    return upsertSetting(supabase, "payments.defaults", value.data);
  });
}

export async function saveInvoiceSettings(input: unknown) {
  return mutate("settings.write", invoiceSettingsFormSchema, input, async (form, supabase) => {
    const value = invoiceSettingsSchema.safeParse(form);
    if (!value.success) return { error: { message: "invalid", code: "invalidContent" } };
    return upsertSetting(supabase, "business.invoice", value.data);
  });
}
