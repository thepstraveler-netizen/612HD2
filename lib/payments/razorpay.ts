import "server-only";
import { z } from "zod";
import type { RazorpayConfig } from "@/lib/env.server";

/**
 * Minimal Razorpay REST client (orders, payments, refunds, payment links)
 * over fetch with basic auth, so no SDK ships with the app. Every response
 * is parsed with zod; anything unexpected throws.
 */

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T extends z.ZodType>(
  config: RazorpayConfig,
  method: "GET" | "POST",
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.output<T>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = z
      .object({ error: z.object({ code: z.string().optional(), description: z.string().optional() }) })
      .safeParse(json);
    throw new RazorpayError(
      error.success ? (error.data.error.description ?? "Razorpay error") : `Razorpay HTTP ${res.status}`,
      res.status,
      error.success ? error.data.error.code : undefined,
    );
  }
  return schema.parse(json);
}

export const orderSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  receipt: z.string().nullable().optional(),
  status: z.string(),
});

export const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  method: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});
export type RazorpayPayment = z.infer<typeof paymentSchema>;

export const refundSchema = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number().int(),
  status: z.enum(["pending", "processed", "failed"]),
});

export const paymentLinkSchema = z.object({
  id: z.string(),
  short_url: z.string(),
  amount: z.number().int(),
  status: z.string(),
});

export function createOrder(
  config: RazorpayConfig,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
) {
  return call(config, "POST", "/orders", orderSchema, {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt,
    notes: input.notes,
  });
}

export function fetchPayment(config: RazorpayConfig, paymentId: string) {
  return call(config, "GET", `/payments/${encodeURIComponent(paymentId)}`, paymentSchema);
}

export function capturePayment(config: RazorpayConfig, paymentId: string, amountPaise: number) {
  return call(config, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, paymentSchema, {
    amount: amountPaise,
    currency: "INR",
  });
}

export function refundPayment(
  config: RazorpayConfig,
  paymentId: string,
  input: { amountPaise: number; notes: Record<string, string>; receipt: string },
) {
  return call(config, "POST", `/payments/${encodeURIComponent(paymentId)}/refund`, refundSchema, {
    amount: input.amountPaise,
    speed: "normal",
    notes: input.notes,
    receipt: input.receipt,
  });
}

export function createPaymentLink(
  config: RazorpayConfig,
  input: {
    amountPaise: number;
    referenceId: string;
    description: string;
    customer: { name: string; email?: string | null; contact: string };
    callbackUrl: string;
    expireBy: number;
    notes: Record<string, string>;
  },
) {
  return call(config, "POST", "/payment_links", paymentLinkSchema, {
    amount: input.amountPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: input.referenceId,
    description: input.description,
    customer: {
      name: input.customer.name,
      contact: input.customer.contact,
      ...(input.customer.email ? { email: input.customer.email } : {}),
    },
    notify: { sms: true, email: Boolean(input.customer.email) },
    reminder_enable: true,
    callback_url: input.callbackUrl,
    callback_method: "get",
    expire_by: input.expireBy,
    notes: input.notes,
  });
}

/** Cancels an unpaid payment link (a withdrawn or replaced quote). */
export function cancelPaymentLink(config: RazorpayConfig, linkId: string) {
  return call(config, "POST", `/payment_links/${encodeURIComponent(linkId)}/cancel`, paymentLinkSchema);
}
