import "server-only";
import { emailConfig } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickTemplates, renderTemplate, type Channel, type TemplateValues } from "./render";

/**
 * Sends a templated notification on every channel that has an active
 * template, and logs each attempt in `notification_logs`. Providers are
 * adapters: email goes through Resend when RESEND_API_KEY is set; SMS and
 * WhatsApp are logged as "skipped" until their providers are configured
 * (phase 10). A failed send never fails the booking.
 */

type Recipient = { email: string | null; phone: string | null; userId: string | null };
type SendResult = {
  status: "sent" | "failed" | "skipped";
  provider: string | null;
  id?: string;
  error?: string;
};

type Adapter = (to: Recipient, message: { subject: string; body: string }) => Promise<SendResult>;

const sendEmail: Adapter = async (to, message) => {
  const config = emailConfig();
  if (!config) return { status: "skipped", provider: null, error: "email provider not configured" };
  if (!to.email) return { status: "skipped", provider: "resend", error: "no email address" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [to.email],
        subject: message.subject,
        text: message.body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok
      ? { status: "sent", provider: "resend", id: json.id }
      : { status: "failed", provider: "resend", error: json.message ?? `HTTP ${res.status}` };
  } catch (error) {
    return {
      status: "failed",
      provider: "resend",
      error: error instanceof Error ? error.message : "send failed",
    };
  }
};

const notConfigured =
  (provider: string): Adapter =>
  async () => ({ status: "skipped", provider, error: `${provider} not configured` });

const ADAPTERS: Record<Channel, Adapter> = {
  email: sendEmail,
  sms: notConfigured("sms"),
  whatsapp: notConfigured("whatsapp"),
};

export async function notify(input: {
  key: string;
  locale: "en" | "hi";
  to: Recipient;
  values: TemplateValues;
  bookingId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("notification_templates")
      .select("channel, locale, subject, body")
      .eq("key", input.key)
      .eq("is_active", true);
    for (const template of pickTemplates(rows ?? [], input.locale)) {
      const message = {
        subject: renderTemplate(template.subject ?? input.key, input.values),
        body: renderTemplate(template.body, input.values),
      };
      const result = await ADAPTERS[template.channel](input.to, message);
      await admin.from("notification_logs").insert({
        template_key: input.key,
        channel: template.channel,
        recipient: template.channel === "email" ? input.to.email : input.to.phone,
        booking_id: input.bookingId ?? null,
        user_id: input.to.userId,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.id ?? null,
        error: result.error ?? null,
      });
    }
  } catch (error) {
    console.error("[notify] failed", input.key, error);
  }
}
