import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signature checks (HMAC-SHA256, hex). Comparisons are constant
 * time so a forged signature cannot be found byte by byte.
 */

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function safeEqualHex(expected: string, received: string): boolean {
  if (!/^[0-9a-f]+$/i.test(received) || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received.toLowerCase(), "hex"));
}

/** Checkout callback: signature over `order_id|payment_id` with the key secret. */
export function verifyPaymentSignature(
  input: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  return safeEqualHex(hmacHex(keySecret, `${input.orderId}|${input.paymentId}`), input.signature);
}

/** Webhook: signature over the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
}
