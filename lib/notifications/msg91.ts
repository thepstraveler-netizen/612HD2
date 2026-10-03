import { normalizeIndianPhone, providerDigits } from "./phone";
import {
  errorMessage,
  redactSecrets,
  type FetchLike,
  type NotificationProvider,
  type ProviderSettings,
} from "./providers";
import { templatePlaceholders } from "./render";

export type Msg91Config = { authKey: string; senderId: string | null };

export const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

/**
 * SMS through the MSG91 Flow API. Indian SMS must use a DLT-registered
 * template, so the text sent is the MSG91 template (by `template_id` from
 * the `notifications.providers` setting) filled with var1..varN, not the
 * stored body; the stored body only decides which placeholders go where.
 */
export function createMsg91Provider(options: {
  config: Msg91Config | null;
  templates: ProviderSettings["sms"];
  fetch?: FetchLike;
}): NotificationProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    name: "msg91",
    async send(to, message) {
      const { config } = options;
      if (!config) return { status: "skipped", provider: "msg91", error: "msg91 not configured" };
      const phone = normalizeIndianPhone(to.phone);
      if (!phone) return { status: "skipped", provider: "msg91", error: "no valid phone number" };
      const template = options.templates[message.key];
      if (!template?.template_id) {
        return { status: "skipped", provider: "msg91", error: `no DLT template id for ${message.key}` };
      }
      const names = template.variables ?? templatePlaceholders(message.templateBody);
      const recipient: Record<string, string> = { mobiles: providerDigits(phone) };
      names.forEach((name, index) => {
        const value = message.values[name];
        recipient[`var${index + 1}`] = value === null || value === undefined ? "" : String(value);
      });
      const body: Record<string, unknown> = {
        template_id: template.template_id,
        short_url: "0",
        recipients: [recipient],
      };
      if (config.senderId) body.sender = config.senderId;
      try {
        const res = await doFetch(MSG91_FLOW_URL, {
          method: "POST",
          headers: {
            authkey: config.authKey,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json().catch(() => ({}))) as { type?: string; message?: unknown };
        const detail = typeof json.message === "string" ? json.message : "";
        if (res.ok && json.type === "success") {
          return { status: "sent", provider: "msg91", id: detail || undefined };
        }
        const error = detail || `HTTP ${res.status}`;
        return {
          status: "failed",
          provider: "msg91",
          error: redactSecrets(res.ok ? error : `HTTP ${res.status}: ${error}`, [config.authKey]),
        };
      } catch (error) {
        return {
          status: "failed",
          provider: "msg91",
          error: redactSecrets(errorMessage(error), [config.authKey]),
        };
      }
    },
  };
}
