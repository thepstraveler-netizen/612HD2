/**
 * Notification templates are admin-edited text with `{{placeholders}}`.
 * Unknown placeholders render as empty strings so a typo never leaks
 * template syntax to a guest.
 */

export type TemplateValues = Record<string, string | number | null | undefined>;

export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

/** Placeholders a template uses, for the admin editor's hint list. */
export function templatePlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]))];
}

/** Placeholders every booking notification can use. */
export const BOOKING_PLACEHOLDERS = [
  "name",
  "code",
  "hotel",
  "check_in",
  "check_out",
  "rooms",
  "guests",
  "total",
  "paid",
  "balance",
  "refund",
  "amount",
  "link",
  "trip_url",
] as const;

export type Channel = "email" | "sms" | "whatsapp";

export type TemplateRow = { channel: Channel; locale: "en" | "hi"; subject: string | null; body: string };

/** One template per channel: the guest's language if present, else English. */
export function pickTemplates(rows: readonly TemplateRow[], locale: "en" | "hi"): TemplateRow[] {
  const byChannel = new Map<Channel, TemplateRow>();
  for (const row of rows) {
    const current = byChannel.get(row.channel);
    if (!current || (row.locale === locale && current.locale !== locale)) byChannel.set(row.channel, row);
  }
  return [...byChannel.values()];
}
