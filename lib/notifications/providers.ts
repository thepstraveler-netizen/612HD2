import { z } from "zod";
import type { TemplateValues } from "./render";

/**
 * Provider adapters for notifications. Each channel has one provider; a
 * provider that is not configured answers "skipped" so nothing breaks when
 * its env vars are absent. Adapters never throw and never put credentials in
 * the result (the result's `error` is written to `notification_logs`).
 */

export type Recipient = { email: string | null; phone: string | null; userId: string | null };

export type SendStatus = "sent" | "failed" | "skipped";

export type SendResult = {
  status: SendStatus;
  provider: string | null;
  id?: string;
  error?: string;
};

export type OutgoingMessage = {
  /** Template key, e.g. "booking.confirmed". */
  key: string;
  /** Locale of the template row being sent. */
  locale: "en" | "hi";
  subject: string;
  body: string;
  /** The unrendered template body, used to derive provider variables. */
  templateBody: string;
  values: TemplateValues;
};

export interface NotificationProvider {
  readonly name: string;
  send(to: Recipient, message: OutgoingMessage): Promise<SendResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const placeholderName = z.string().regex(/^[a-z0-9_]+$/i);

/**
 * `notifications.providers` setting: provider-side template ids per template
 * key. MSG91 needs the DLT-approved flow/template id; WhatsApp needs the
 * Meta-approved template name. `variables` / `params` list the placeholders
 * in the order the provider template expects; when left out they follow the
 * order the placeholders appear in the stored template body.
 */
export const providerSettingsSchema = z.object({
  sms: z
    .record(
      z.string(),
      z.object({
        template_id: z.string().trim().default(""),
        variables: z.array(placeholderName).max(30).optional(),
      }),
    )
    .default({}),
  whatsapp: z
    .record(
      z.string(),
      z.object({
        name: z.string().trim().default(""),
        languages: z.object({ en: z.string().optional(), hi: z.string().optional() }).optional(),
        params: z.array(placeholderName).max(30).optional(),
      }),
    )
    .default({}),
});

export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export function parseProviderSettings(value: unknown): ProviderSettings {
  const parsed = providerSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { sms: {}, whatsapp: {} };
}

/** Replace any credential that leaked into a provider error and cap its length. */
export function redactSecrets(text: string, secrets: readonly (string | null | undefined)[]): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  return out.slice(0, 500);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.name === "TimeoutError" ? "timed out" : error.message;
  return "send failed";
}
