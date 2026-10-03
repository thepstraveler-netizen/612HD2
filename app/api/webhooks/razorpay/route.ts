import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyRazorpayPayment } from "@/lib/bookings/service";
import { razorpayConfig } from "@/lib/env.server";
import { logger } from "@/lib/observability/log";
import { reportServerError } from "@/lib/observability/server";
import { paymentSchema, refundSchema } from "@/lib/payments/razorpay";
import { verifyWebhookSignature } from "@/lib/payments/signature";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * Razorpay webhook: the source of truth for payments and refunds.
 *
 * 1. The signature over the raw body is checked with the webhook secret.
 * 2. The event is stored once per `x-razorpay-event-id`; a redelivery of an
 *    event we already processed is acknowledged without doing anything.
 * 3. Payment handling itself is idempotent on the payment id, so even two
 *    deliveries racing each other confirm a booking once.
 * A processing error returns 500 so Razorpay retries; the stored event is
 * left unprocessed and the retry picks it up.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const envelopeSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: paymentSchema }).optional(),
    refund: z.object({ entity: refundSchema }).optional(),
    payment_link: z.object({ entity: z.object({ id: z.string() }) }).optional(),
  }),
});

const PAYMENT_EVENTS = new Set(["payment.authorized", "payment.captured", "payment.failed", "order.paid"]);
const REFUND_EVENTS = new Set(["refund.created", "refund.processed", "refund.failed"]);

export async function POST(request: NextRequest) {
  const config = razorpayConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = envelopeSchema.safeParse(json);
  const eventType = parsed.success ? parsed.data.event : "unknown";
  const eventId =
    request.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(raw).digest("hex");

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("payment_events")
    .upsert(
      { provider: "razorpay", event_id: eventId, event_type: eventType, payload: json as Json },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) {
    logger.error("razorpay webhook: could not store event", { eventType, error: insertError });
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }
  let rowId = inserted?.[0]?.id;
  if (!rowId) {
    const { data: existing } = await admin
      .from("payment_events")
      .select("id, processed_at")
      .eq("provider", "razorpay")
      .eq("event_id", eventId)
      .maybeSingle();
    if (!existing || existing.processed_at) return NextResponse.json({ status: "duplicate" });
    rowId = existing.id;
  }

  if (!parsed.success) {
    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString(), result: "ignored", error: "unrecognised payload" })
      .eq("id", rowId);
    return NextResponse.json({ status: "ignored" });
  }

  try {
    const { payload } = parsed.data;
    let result = "ignored";
    let bookingId: string | null = null;

    if (eventType === "payment_link.paid" && payload.payment && payload.payment_link) {
      result = await applyRazorpayPayment(config, payload.payment.entity, {
        paymentLinkId: payload.payment_link.entity.id,
      });
    } else if (PAYMENT_EVENTS.has(eventType) && payload.payment?.entity.order_id) {
      result = await applyRazorpayPayment(config, payload.payment.entity);
    } else if (REFUND_EVENTS.has(eventType) && payload.refund) {
      const refund = payload.refund.entity;
      const { data: payment } = await admin
        .from("payments")
        .select("id, booking_id")
        .eq("provider", "razorpay")
        .eq("provider_payment_id", refund.payment_id)
        .maybeSingle();
      if (payment) {
        bookingId = payment.booking_id;
        const { data, error } = await admin.rpc("record_refund", {
          p: {
            payment_id: payment.id,
            amount_paise: refund.amount,
            provider_refund_id: refund.id,
            status: refund.status,
            reason: "Razorpay refund",
            raw: refund,
          },
        });
        if (error) throw new Error(error.message);
        result = String((data as { result?: string } | null)?.result ?? "recorded");
      } else {
        result = "unknown_payment";
      }
    }

    if (!bookingId && payload.payment?.entity.order_id) {
      const { data: payment } = await admin
        .from("payments")
        .select("booking_id")
        .eq("provider_order_id", payload.payment.entity.order_id)
        .maybeSingle();
      bookingId = payment?.booking_id ?? null;
    }
    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString(), result, booking_id: bookingId, error: null })
      .eq("id", rowId);
    return NextResponse.json({ status: "ok", result });
  } catch (error) {
    logger.error("razorpay webhook: processing failed", { eventType, eventId, error });
    await reportServerError(error, { tags: { area: "razorpay-webhook", event: eventType } });
    await admin
      .from("payment_events")
      .update({ error: error instanceof Error ? error.message.slice(0, 500) : "failed" })
      .eq("id", rowId);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
