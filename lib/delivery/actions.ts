"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { verifyHotelPayment, type BookResult, type VerifyResult } from "@/lib/bookings/actions";
import { BookingError, expireStaleBookings } from "@/lib/bookings/service";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { finalizePrice } from "@/lib/pricing/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  acceptQuoteSchema,
  cartQuoteSchema,
  orderCheckoutSchema,
  prescriptionSchema,
  quoteLinesSchema,
  rateOrderSchema,
  savedAddressSchema,
  uuid,
} from "@/schemas/delivery";
import { buildQuoteLines, orderPayModes } from "./cart";
import { prepareOrderCheckout, toOrderPreview, type OrderCheckoutError, type OrderPreview } from "./checkout";
import { getDeliverySettings } from "./queries";
import { createDeliveryOrder, createMedicineOrder } from "./service";

/**
 * Customer actions for food, essentials and medicine. Inputs are re-parsed
 * here and every price is recomputed on the server.
 */

export type CartPreviewResult = OrderPreview | { ok: false; error: OrderCheckoutError | "invalid"; itemId?: string };

export async function previewCart(input: unknown): Promise<CartPreviewResult> {
  const parsed = cartQuoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  const result = await prepareOrderCheckout(parsed.data, session?.user.id ?? null);
  return result.ok ? toOrderPreview(result) : result;
}

export type PlaceOrderError =
  | Exclude<BookResult, { ok: true }>["error"]
  | OrderCheckoutError
  | "below_minimum"
  | "no_zone";
export type PlaceOrderResult =
  | Extract<BookResult, { ok: true }>
  | { ok: false; error: PlaceOrderError; field?: string; itemId?: string; preview?: OrderPreview };

const placeOrderSchema = z.object({
  checkout: orderCheckoutSchema,
  expectedTotalPaise: z.number().int().nonnegative(),
});

export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const request = parsed.data.checkout;

  await expireStaleBookings().catch(() => undefined);
  const checkout = await prepareOrderCheckout({ ...request, zoneId: request.address.zoneId }, session.user.id);
  if (!checkout.ok) return checkout;
  const preview = toOrderPreview(checkout);
  if (!checkout.zone) return { ok: false, error: "no_zone" };
  if (checkout.shortOfMinimumPaise > 0) return { ok: false, error: "below_minimum", preview };
  if (request.coupon && checkout.couponError) return { ok: false, error: "coupon", preview };
  if (checkout.pay !== request.pay) return { ok: false, error: "payment_mode", preview };
  if (checkout.price.totalPaise !== parsed.data.expectedTotalPaise) {
    return { ok: false, error: "price_changed", preview };
  }

  if (request.saveAddress) {
    await saveAddressFor(session.user.id, { ...request.address, label: "Home", isDefault: false }).catch(
      (e: unknown) => console.error("[delivery] save address", e),
    );
  }

  try {
    const created = await createDeliveryOrder(
      checkout,
      request.address,
      {
        name: request.address.contactName,
        phone: request.address.phone,
        email: request.email || session.user.email || null,
        notes: request.notes ?? null,
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
      prefill: {
        name: request.address.contactName,
        email: request.email || session.user.email || "",
        contact: request.address.phone,
      },
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.code };
    console.error("[delivery] placeOrder failed", error);
    return { ok: false, error: "unknown" };
  }
}

/** Razorpay callback for online orders; same checks as hotels (the booking must be the caller's). */
export async function verifyOrderPayment(input: unknown): Promise<VerifyResult> {
  return verifyHotelPayment(input);
}

export type RateOrderResult =
  { ok: true } | { ok: false; error: "signin" | "invalid" | "not_found" | "already_rated" | "unknown" };

export async function rateOrder(input: unknown): Promise<RateOrderResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = rateOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "not_found" };
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("code", parsed.data.code)
    .eq("user_id", session.user.id)
    .in("service", ["food", "essentials", "medicine"])
    .maybeSingle();
  if (!booking) return { ok: false, error: "not_found" };
  const { data: order } = await admin.from("orders").select("id").eq("booking_id", booking.id).maybeSingle();
  if (!order) return { ok: false, error: "not_found" };
  const { error } = await admin.rpc("rate_order", {
    p_order_id: order.id,
    p_user: session.user.id,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment ?? "",
  });
  if (error) {
    if (error.message.includes("invalid_transition")) return { ok: false, error: "already_rated" };
    if (error.message.includes("not_found")) return { ok: false, error: "not_found" };
    console.error("[delivery] rating failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath(`/[locale]/account/trips/${parsed.data.code}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------- address book

export type AddressResult = { ok: true; id: string } | { ok: false; error: "signin" | "invalid" | "unknown" };

async function saveAddressFor(userId: string, input: z.input<typeof savedAddressSchema>, id?: string) {
  const a = savedAddressSchema.parse(input);
  const supabase = await createClient();
  const row = {
    user_id: userId,
    label: a.label,
    contact_name: a.contactName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    landmark: a.landmark || null,
    pincode: a.pincode || null,
    zone_id: a.zoneId,
    is_default: a.isDefault,
  };
  if (a.isDefault) await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
  const res = id
    ? await supabase.from("addresses").update(row).eq("id", id).select("id").single()
    : await supabase.from("addresses").insert(row).select("id").single();
  if (res.error) throw res.error;
  return res.data.id;
}

/** Address book writes go through the user's own session (RLS: owner only). */
export async function saveAddress(input: unknown): Promise<AddressResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = savedAddressSchema.extend({ id: uuid.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const { id, ...rest } = parsed.data;
    const saved = await saveAddressFor(session.user.id, rest, id);
    revalidatePath("/[locale]/account", "layout");
    return { ok: true, id: saved };
  } catch (error) {
    console.error("[delivery] save address", error);
    return { ok: false, error: "unknown" };
  }
}

export async function deleteAddress(input: unknown): Promise<{ ok: boolean }> {
  const session = await getSession();
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!session || !parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").delete().eq("id", parsed.data.id);
  revalidatePath("/[locale]/account", "layout");
  return { ok: !error };
}

// ---------------------------------------------------------------- medicine

export type PrescriptionResult =
  | { ok: true; id: string }
  | { ok: false; error: "signin" | "forbidden" | "invalid" | "booking_closed" | "invalid_file" | "unknown"; field?: string };

/**
 * Files are uploaded by the browser straight to the private `prescriptions`
 * bucket under the user's own folder (storage policy); this records them.
 */
export async function submitPrescription(input: unknown): Promise<PrescriptionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = prescriptionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole() || !(await getFeatureFlag("booking.medicine"))) return { ok: false, error: "booking_closed" };
  const p = parsed.data;
  const { data, error } = await createAdminClient().rpc("submit_prescription", {
    p: {
      user_id: session.user.id,
      patient_name: p.patientName,
      patient_age: p.patientAge === "" || p.patientAge === undefined ? null : p.patientAge,
      phone: p.address.phone,
      zone_id: p.address.zoneId,
      address: {
        contact_name: p.address.contactName,
        phone: p.address.phone,
        line1: p.address.line1,
        line2: p.address.line2 || null,
        landmark: p.address.landmark || null,
        pincode: p.address.pincode || null,
      },
      files: p.files,
      notes: p.notes ?? null,
    },
  });
  if (error) {
    if (error.message.includes("invalid_file")) return { ok: false, error: "invalid_file" };
    console.error("[delivery] prescription failed", error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath("/[locale]/account", "layout");
  return { ok: true, id: data };
}

export type AcceptQuoteResult =
  | Extract<BookResult, { ok: true }>
  | {
      ok: false;
      error: "signin" | "forbidden" | "invalid" | "not_found" | "expired" | "payment_mode" | "booking_closed" | "payment_failed" | "unknown";
    };

async function loadMyQuote(quoteId: string, userId: string) {
  const admin = createAdminClient();
  const { data: quote } = await admin.from("medicine_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!quote) return null;
  const { data: prescription } = await admin
    .from("prescriptions")
    .select("*")
    .eq("id", quote.prescription_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prescription) return null;
  const { data: store } = await admin
    .from("stores")
    .select("id, kind, name, slug, phone")
    .eq("id", quote.store_id)
    .maybeSingle();
  return store ? { quote, prescription, store } : null;
}

/** Turns the customer's accepted quote into a medicine order (cash on delivery or online). */
export async function acceptQuote(input: unknown): Promise<AcceptQuoteResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  if (session.profile?.is_blocked) return { ok: false, error: "forbidden" };
  const parsed = acceptQuoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const found = await loadMyQuote(parsed.data.quoteId, session.user.id);
  if (!found) return { ok: false, error: "not_found" };
  const { quote, prescription, store } = found;
  if (quote.status !== "sent" || Date.parse(quote.valid_until) <= Date.now()) return { ok: false, error: "expired" };

  const [settings, payments, invoice] = await Promise.all([
    getDeliverySettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
  ]);
  const lines = quoteLinesSchema.parse(quote.lines);
  const base = finalizePrice(buildQuoteLines(lines, quote.delivery_fee_paise, settings, null), 0, []);
  const modes = orderPayModes(base.totalPaise, settings, Boolean(razorpayConfig()));
  if (!modes.includes(parsed.data.pay)) return { ok: false, error: "payment_mode" };
  const price =
    parsed.data.pay === "online"
      ? finalizePrice(
          buildQuoteLines(lines, quote.delivery_fee_paise, settings, {
            convenienceFeePaise: payments.convenience_fee_paise,
            feeTaxBps: payments.fee_tax_bps,
            feeSac: invoice.sac_services,
          }),
          0,
          [],
        )
      : base;

  try {
    const created = await createMedicineOrder(
      { quote, prescription, store, price, pay: parsed.data.pay, holdMinutes: settings.hold_minutes },
      {
        name: prescription.patient_name,
        phone: prescription.phone,
        email: session.user.email ?? null,
        notes: null,
      },
      session.user.id,
      parsed.data.locale,
    );
    revalidatePath("/[locale]/account", "layout");
    if (created.status === "confirmed") return { ok: true, code: created.code, status: "confirmed" };
    return {
      ok: true,
      code: created.code,
      status: "pending_payment",
      order: created.order,
      prefill: { name: prescription.patient_name, email: session.user.email ?? "", contact: prescription.phone },
    };
  } catch (error) {
    if (error instanceof BookingError) {
      if (error.code === "payment_failed") return { ok: false, error: "payment_failed" };
      return { ok: false, error: error.code === "quote_invalid" ? "expired" : "unknown" };
    }
    console.error("[delivery] accept quote failed", error);
    return { ok: false, error: "unknown" };
  }
}

export async function declineQuote(input: unknown): Promise<{ ok: boolean }> {
  const session = await getSession();
  const parsed = z.object({ quoteId: uuid }).safeParse(input);
  if (!session || !parsed.success || !hasServiceRole()) return { ok: false };
  const found = await loadMyQuote(parsed.data.quoteId, session.user.id);
  if (!found || found.quote.status !== "sent") return { ok: false };
  const admin = createAdminClient();
  await admin.from("medicine_quotes").update({ status: "declined" }).eq("id", found.quote.id);
  await admin.from("prescriptions").update({ status: "reviewing" }).eq("id", found.prescription.id);
  revalidatePath("/[locale]/account", "layout");
  return { ok: true };
}
