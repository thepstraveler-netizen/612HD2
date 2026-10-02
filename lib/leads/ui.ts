import { addDays, todayInIndia } from "@/lib/dates";
import { paiseToRupeesInput } from "@/lib/money";
import {
  LEAD_STATUSES,
  leadFiltersSchema,
  quoteLineInputSchema,
  type LeadFilters,
  type LeadStatus,
  type LeadsSettings,
  type QuoteFormInput,
  type QuoteLineInput,
  type QuoteStatus,
} from "@/schemas/leads";
import type { LeadCard } from "./crm";
import { priceQuote, type PricedQuote, type QuoteLine } from "./quote";
import type { FollowUpState } from "./status";

/**
 * Pure helpers for the Admin → Leads screens (board, lead page, quote
 * builder). Nothing here talks to the server; money stays in paise and the
 * quote preview is only a preview (the server re-prices on save).
 */

type Tone = "success" | "warning" | "danger" | "info" | "muted";

export function leadStatusTone(status: LeadStatus): Tone {
  switch (status) {
    case "new":
      return "info";
    case "contacted":
    case "quoted":
      return "warning";
    case "won":
      return "success";
    case "lost":
      return "muted";
  }
}

export function quoteStatusTone(status: QuoteStatus): Tone {
  switch (status) {
    case "paid":
      return "success";
    case "sent":
      return "info";
    case "draft":
      return "warning";
    case "expired":
      return "danger";
    case "cancelled":
      return "muted";
  }
}

export function followUpTone(state: FollowUpState): Tone {
  return state === "overdue" ? "danger" : state === "today" ? "warning" : "muted";
}

// ---------------------------------------------------------------- filters

const FILTER_KEYS = ["status", "kind", "source", "assignee", "due", "q"] as const;

/** URL search params → pipeline filters (first value wins; empty values and junk are dropped). */
export function parseLeadFilters(raw: Record<string, string | string[] | undefined>): LeadFilters {
  return leadFiltersSchema.parse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v)?.trim() || undefined]),
    ),
  );
}

/** Filters → `?view=list&status=new…` (board view and page 1 are the defaults and left out). */
export function leadFiltersQuery(
  filters: Partial<LeadFilters>,
  overrides: Partial<LeadFilters> = {},
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.view === "list") params.set("view", "list");
  for (const key of FILTER_KEYS) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  if (merged.view === "list" && merged.page && merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when any filter beyond the view is set. */
export function hasLeadFilters(filters: Partial<LeadFilters>): boolean {
  return FILTER_KEYS.some((key) => Boolean(filters[key]));
}

/** Board columns: cards per status, in pipeline order, newest first as listed. */
export function groupLeadsByStatus<T extends Pick<LeadCard, "status">>(
  leads: readonly T[],
): Record<LeadStatus, T[]> {
  const groups = Object.fromEntries(LEAD_STATUSES.map((s) => [s, [] as T[]])) as Record<LeadStatus, T[]>;
  for (const lead of leads) groups[lead.status].push(lead);
  return groups;
}

// ---------------------------------------------------------------- follow-ups

export type FollowUpPick = "hour" | "tomorrow" | "threeDays";
export const FOLLOW_UP_PICKS: readonly FollowUpPick[] = ["hour", "tomorrow", "threeDays"];

/** An India wall-clock time on an ISO date → the UTC instant (India has no DST). */
function indiaAt(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}

/**
 * Quick-pick follow-up times, in India time whatever the agent's device
 * zone: in one hour (to the minute), tomorrow 10 am, and 10 am three days
 * from today.
 */
export function followUpPickAt(pick: FollowUpPick, now: Date = new Date()): string {
  if (pick === "hour") {
    const at = new Date(now.getTime() + 3_600_000);
    at.setUTCSeconds(0, 0);
    return at.toISOString();
  }
  const today = todayInIndia(now);
  return indiaAt(addDays(today, pick === "tomorrow" ? 1 : 3), 10).toISOString();
}

// ---------------------------------------------------------------- lead facts

const text = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** What the customer asked for, from `leads.details` (only the parts that are present). */
export function leadTravelFacts(details: Record<string, unknown>): {
  from: string;
  to: string;
  departOn: string;
  returnOn: string;
  startDate: string;
  adults: number;
  children: number;
  travelClass: string;
} {
  return {
    from: text(details.from),
    to: text(details.to),
    departOn: text(details.depart_on),
    returnOn: text(details.return_on),
    startDate: text(details.start_date),
    adults: Number(details.adults) || 0,
    children: Number(details.children) || 0,
    travelClass: text(details.class),
  };
}

/** UTM tags with a value, in a stable order (utm_source first). */
export function utmEntries(utm: Record<string, unknown>): [string, string][] {
  const order = ["source", "medium", "campaign", "term", "content"];
  const rank = (k: string) => {
    const i = order.indexOf(k.replace(/^utm_/, ""));
    return i === -1 ? order.length : i;
  };
  return Object.entries(utm)
    .map(([k, v]) => [k, text(v)] as [string, string])
    .filter(([, v]) => v)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Picker value for "Other": the agent types the reason. */
export const OTHER_REASON = "__other";

/** The reason sent when marking a lead Lost: a listed reason, or the agent's own words for "Other". */
export function lostReasonText(choice: string, other: string): string {
  return choice === OTHER_REASON ? other.trim() : choice.trim();
}

/** Lost reasons for the picker: the listed ones minus a trailing "Other" (offered separately with free text). */
export function lostReasonOptions(reasons: readonly string[]): string[] {
  return reasons.filter((r) => !/^other$/i.test(r.trim()));
}

// ---------------------------------------------------------------- quotes

/** A blank quote line with the GST % and SAC from `leads.defaults`. */
export function newQuoteLine(settings: Pick<LeadsSettings, "quote_tax_bps" | "quote_sac">): QuoteLineInput {
  return {
    description: "",
    quantity: 1,
    unitPrice: "",
    taxPercent: settings.quote_tax_bps / 100,
    sac: settings.quote_sac,
  };
}

/** Saved quote lines (paise, basis points) back into what the builder's inputs hold (rupees, %). */
export function quoteLinesToInput(lines: readonly QuoteLine[]): QuoteLineInput[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: paiseToRupeesInput(l.unit_price_paise),
    taxPercent: l.tax_rate_bps / 100,
    sac: l.sac,
  }));
}

/** Whole hours a draft has left (at least 1), so re-saving keeps roughly the same expiry. */
export function hoursLeft(validUntil: string, fallback: number, now: Date = new Date()): number {
  const ms = Date.parse(validUntil) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  return Math.min(720, Math.max(1, Math.ceil(ms / 3_600_000)));
}

/** Builder values for a new quote, or to edit a saved draft. */
export function quoteFormDefaults(
  leadId: string,
  settings: Pick<LeadsSettings, "quote_tax_bps" | "quote_sac" | "quote_valid_hours">,
  draft?: {
    id: string;
    title: string;
    lines: readonly QuoteLine[];
    totalPaise: number;
    payNowPaise: number;
    validUntil: string;
    notes: string | null;
    terms: string | null;
  },
  defaultTitle = "",
  now: Date = new Date(),
): QuoteFormInput {
  if (!draft) {
    return {
      leadId,
      title: defaultTitle,
      lines: [newQuoteLine(settings)],
      payNow: "full",
      advance: "",
      validHours: settings.quote_valid_hours,
      notes: "",
      terms: "",
    };
  }
  const advance = draft.payNowPaise < draft.totalPaise;
  return {
    quoteId: draft.id,
    leadId,
    title: draft.title,
    lines: draft.lines.length ? quoteLinesToInput(draft.lines) : [newQuoteLine(settings)],
    payNow: advance ? "advance" : "full",
    advance: advance ? paiseToRupeesInput(draft.payNowPaise) : "",
    validHours: hoursLeft(draft.validUntil, settings.quote_valid_hours, now),
    notes: draft.notes ?? "",
    terms: draft.terms ?? "",
  };
}

/** Live totals for the lines typed so far; lines that do not parse yet are left out and flagged. */
export function quotePreview(lines: readonly unknown[]): PricedQuote & { incomplete: boolean } {
  const valid = lines.flatMap((l) => {
    const parsed = quoteLineInputSchema.safeParse(l);
    return parsed.success ? [parsed.data] : [];
  });
  const priced = valid.length
    ? priceQuote(valid)
    : { lines: [], subtotalPaise: 0, taxPaise: 0, totalPaise: 0 };
  return { ...priced, incomplete: valid.length < lines.length };
}

export type QuoteAction = "edit" | "send" | "withdraw" | "recordPayment";

/** What staff can do with a quote: drafts are edited and sent; a sent quote is withdrawn or paid by hand. */
export function quoteActions(
  status: QuoteStatus,
  { canWrite, canPay, leadOpen }: { canWrite: boolean; canPay: boolean; leadOpen: boolean },
): QuoteAction[] {
  const out: QuoteAction[] = [];
  if (status === "draft" && canWrite && leadOpen) out.push("edit", "send");
  if ((status === "draft" || status === "sent") && canWrite) out.push("withdraw");
  if (status === "sent" && canPay) out.push("recordPayment");
  return out;
}
