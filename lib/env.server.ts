import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/** Server-only secrets. Importing this from a client component fails the build. */
export function serverEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Missing server environment variables.\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string | null };

/** Razorpay keys, or null when online payment is not set up (checkout then offers only pay at hotel). */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null };
}

/** True when the service-role key is present, which booking writes need. */
export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type EmailConfig = { apiKey: string; from: string };

export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: process.env.NOTIFY_FROM_EMAIL || "The P & S Traveler Group <bookings@example.com>" };
}

/** MSG91 SMS (optional). Without MSG91_AUTH_KEY, SMS notifications are logged as skipped. */
export function msg91Config(): { authKey: string; senderId: string | null } | null {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) return null;
  return { authKey, senderId: process.env.MSG91_SENDER_ID || null };
}

/** WhatsApp Cloud API (optional). Needs both the token and the phone number id. */
export function whatsAppConfig(): { token: string; phoneNumberId: string; apiVersion: string } | null {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  const version = process.env.WHATSAPP_API_VERSION;
  return { token, phoneNumberId, apiVersion: version && /^v\d+\.\d+$/.test(version) ? version : "v21.0" };
}
