import "server-only";
import { emailConfig, msg91Config, whatsAppConfig } from "@/lib/env.server";
import { logger } from "@/lib/observability/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMsg91Provider } from "./msg91";
import { normalizeIndianPhone } from "./phone";
import {
  errorMessage,
  parseProviderSettings,
  redactSecrets,
  type NotificationProvider,
  type ProviderSettings,
  type Recipient,
} from "./providers";
import { pickTemplates, renderTemplate, type Channel, type TemplateValues } from "./render";
import { createWhatsAppProvider } from "./whatsapp";

/**
 * Sends a templated notification on every channel that has an active
 * template, and logs each attempt in `notification_logs` (sent / failed /
 * skipped, with the provider's message id or error). Providers are adapters:
 * email through Resend (RESEND_API_KEY), SMS through MSG91 (MSG91_AUTH_KEY)
 * and WhatsApp through the Cloud API (WHATSAPP_CLOUD_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID). A provider without its env vars, or a template
 * without its provider template id in the `notifications.providers`
 * setting, is logged as skipped. A failed send never fails the booking.
 */

const emailProvider: NotificationProvider = {
  name: "resend",
  async send(to, message) {
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
        : {
            status: "failed",
            provider: "resend",
            error: redactSecrets(json.message ?? `HTTP ${res.status}`, [config.apiKey]),
          };
    } catch (error) {
      return {
        status: "failed",
        provider: "resend",
        error: redactSecrets(errorMessage(error), [config.apiKey]),
      };
    }
  },
};

function providersFor(settings: ProviderSettings): Record<Channel, NotificationProvider> {
  return {
    email: emailProvider,
    sms: createMsg91Provider({ config: msg91Config(), templates: settings.sms }),
    whatsapp: createWhatsAppProvider({ config: whatsAppConfig(), templates: settings.whatsapp }),
  };
}

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
    const templates = pickTemplates(rows ?? [], input.locale);
    if (!templates.length) return;

    let settings: ProviderSettings = { sms: {}, whatsapp: {} };
    const needsPhoneProvider = templates.some((t) => t.channel !== "email");
    if (needsPhoneProvider && (msg91Config() || whatsAppConfig())) {
      const { data } = await admin
        .from("settings")
        .select("value")
        .eq("key", "notifications.providers")
        .maybeSingle();
      settings = parseProviderSettings(data?.value);
    }
    const providers = providersFor(settings);
    const phone = normalizeIndianPhone(input.to.phone);

    for (const template of templates) {
      const message = {
        key: input.key,
        locale: template.locale,
        subject: renderTemplate(template.subject ?? input.key, input.values),
        body: renderTemplate(template.body, input.values),
        templateBody: template.body,
        values: input.values,
      };
      const result = await providers[template.channel].send(input.to, message);
      const { error } = await admin.from("notification_logs").insert({
        template_key: input.key,
        channel: template.channel,
        recipient: template.channel === "email" ? input.to.email : (phone ?? input.to.phone),
        booking_id: input.bookingId ?? null,
        user_id: input.to.userId,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.id ?? null,
        error: result.error ?? null,
      });
      if (error)
        logger.warn("notify: could not write log", { key: input.key, channel: template.channel, error });
      if (result.status === "failed") {
        logger.warn("notify: send failed", {
          key: input.key,
          channel: template.channel,
          provider: result.provider,
          error: result.error,
        });
      }
    }
  } catch (error) {
    logger.error("notify failed", { key: input.key, error });
  }
}
