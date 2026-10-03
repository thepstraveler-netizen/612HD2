import { normalizeIndianPhone, providerDigits } from "./phone";
import {
  errorMessage,
  redactSecrets,
  type FetchLike,
  type NotificationProvider,
  type ProviderSettings,
} from "./providers";
import { templatePlaceholders } from "./render";

export type WhatsAppConfig = { token: string; phoneNumberId: string; apiVersion: string };

export function whatsAppMessagesUrl(config: WhatsAppConfig): string {
  return `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
}

/** WhatsApp rejects template parameters with newlines, tabs, runs of spaces or empty text. */
export function whatsAppParam(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 1000) : "-";
}

/**
 * WhatsApp through the Cloud API. Business-initiated messages must be
 * Meta-approved templates, so this sends the template named in the
 * `notifications.providers` setting with the body parameters in order.
 */
export function createWhatsAppProvider(options: {
  config: WhatsAppConfig | null;
  templates: ProviderSettings["whatsapp"];
  fetch?: FetchLike;
}): NotificationProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    name: "whatsapp_cloud",
    async send(to, message) {
      const provider = "whatsapp_cloud";
      const { config } = options;
      if (!config) return { status: "skipped", provider, error: "whatsapp not configured" };
      const phone = normalizeIndianPhone(to.phone);
      if (!phone) return { status: "skipped", provider, error: "no valid phone number" };
      const template = options.templates[message.key];
      if (!template?.name)
        return { status: "skipped", provider, error: `no WhatsApp template for ${message.key}` };
      const names = template.params ?? templatePlaceholders(message.templateBody);
      const language = template.languages?.[message.locale] || message.locale;
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: providerDigits(phone),
        type: "template",
        template: {
          name: template.name,
          language: { code: language },
          components: names.length
            ? [
                {
                  type: "body",
                  parameters: names.map((name) => ({
                    type: "text",
                    text: whatsAppParam(message.values[name]),
                  })),
                },
              ]
            : [],
        },
      };
      try {
        const res = await doFetch(whatsAppMessagesUrl(config), {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json().catch(() => ({}))) as {
          messages?: { id?: string }[];
          error?: { message?: string; code?: number };
        };
        const id = json.messages?.[0]?.id;
        if (res.ok && id) return { status: "sent", provider, id };
        const detail = json.error?.message
          ? `${json.error.code ?? res.status}: ${json.error.message}`
          : `HTTP ${res.status}`;
        return { status: "failed", provider, error: redactSecrets(detail, [config.token]) };
      } catch (error) {
        return { status: "failed", provider, error: redactSecrets(errorMessage(error), [config.token]) };
      }
    },
  };
}
