import { z } from "zod";
import { phoneSchema } from "./booking";
import { LEAD_KINDS } from "./packages";

/**
 * Leads CRM inputs: the pipeline filters, lead actions (assign, status,
 * notes, call logs, follow-ups), a lead typed in by an agent, the quote
 * builder and the Settings → Packages & leads form for `leads.defaults`.
 *
 * Quote prices are typed in rupees and leave these schemas as integer
 * paise; GST is typed as % and leaves as basis points.
 */

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_ACTIVITY_KINDS = [
  "note",
  "call",
  "whatsapp",
  "email",
  "sms",
  "status",
  "assignment",
  "quote",
  "follow_up",
  "system",
] as const;
export type LeadActivityKind = (typeof LEAD_ACTIVITY_KINDS)[number];

/** Activities an agent logs by hand. */
export const LOGGABLE_ACTIVITIES = ["note", "call", "whatsapp", "email", "sms"] as const;
export type LoggableActivity = (typeof LOGGABLE_ACTIVITIES)[number];

export const CALL_OUTCOMES = ["connected", "no_answer", "busy", "wrong_number", "callback"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const QUOTE_STATUSES = ["draft", "sent", "paid", "expired", "cancelled"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** WhatsApp / email quick replies the CRM offers (notification template keys). */
export const QUICK_REPLIES = ["crm.intro", "crm.follow_up", "quote.sent"] as const;
export type QuickReply = (typeof QUICK_REPLIES)[number];

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });

/** `settings` key `leads.defaults` (staff only). */
export const leadsSettingsSchema = z.object({
  /** least_loaded = new leads go to the agent with the fewest open leads; none = stay unassigned. */
  auto_assign: z.enum(["least_loaded", "none"]).default("least_loaded"),
  max_per_phone_per_hour: z.number().int().min(1).max(100).default(5),
  /** First follow-up is due this many hours after the enquiry. */
  first_follow_up_hours: z.number().int().min(0).max(168).default(2),
  quote_valid_hours: z.number().int().min(1).max(720).default(48),
  /** Default GST on a new quote line. */
  quote_tax_bps: z.number().int().min(0).max(2800).default(500),
  quote_sac: z
    .string()
    .regex(/^\d{4,8}$/)
    .default("998555"),
  sources: z
    .array(z.string().regex(/^[a-z0-9_-]{2,40}$/))
    .min(1)
    .max(30)
    .default([
      "website",
      "whatsapp",
      "instagram",
      "facebook",
      "google",
      "calling",
      "walk_in",
      "referral",
      "other",
    ]),
  lost_reasons: z
    .array(z.string().trim().min(2).max(120))
    .min(1)
    .max(30)
    .default([
      "Price too high",
      "Booked elsewhere",
      "Plans cancelled",
      "Not reachable",
      "Just enquiring",
      "Other",
    ]),
});
export type LeadsSettings = z.output<typeof leadsSettingsSchema>;
export type LeadsSettingsInput = z.input<typeof leadsSettingsSchema>;

/** Pipeline filters (URL search params). */
export const leadFiltersSchema = z.object({
  view: z.enum(["board", "list"]).catch("board"),
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  kind: z.enum(LEAD_KINDS).optional().catch(undefined),
  source: z
    .string()
    .regex(/^[a-z0-9_-]{2,40}$/)
    .optional()
    .catch(undefined),
  /** "me", "unassigned" or a staff user id. */
  assignee: z
    .union([z.literal("me"), z.literal("unassigned"), uuid])
    .optional()
    .catch(undefined),
  /** overdue = follow-up time has passed; today = due by the end of today (India time). */
  due: z.enum(["overdue", "today"]).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type LeadFilters = z.output<typeof leadFiltersSchema>;

export const leadIdSchema = z.object({ leadId: uuid });

export const assignLeadSchema = z.object({ leadId: uuid, assignee: uuid.nullable() });

export const leadStatusSchema = z
  .object({
    leadId: uuid,
    status: z.enum(["contacted", "won", "lost"]),
    reason: z.string().trim().max(300).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.status === "lost" && !v.reason)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "required" });
  });
export type LeadStatusInput = z.input<typeof leadStatusSchema>;

export const leadActivitySchema = z
  .object({
    leadId: uuid,
    kind: z.enum(LOGGABLE_ACTIVITIES),
    body: z.string().trim().max(4000).default(""),
    callOutcome: z.enum(CALL_OUTCOMES).optional(),
    callMinutes: z.coerce.number().min(0).max(1440).optional(),
    /** Set the next follow-up at the same time (optional). */
    followUpAt: dateTime.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "call" && !v.callOutcome)
      ctx.addIssue({ code: "custom", path: ["callOutcome"], message: "required" });
    if (v.kind !== "call" && !v.body) ctx.addIssue({ code: "custom", path: ["body"], message: "required" });
  });
export type LeadActivityInput = z.input<typeof leadActivitySchema>;

/** Set (or clear, with null) the next follow-up reminder. */
export const followUpSchema = z.object({
  leadId: uuid,
  at: dateTime.nullable(),
  note: z.string().trim().max(500).default(""),
});
export type FollowUpInput = z.input<typeof followUpSchema>;

/** A lead an agent types in from a call, WhatsApp or walk-in. */
export const manualLeadSchema = z.object({
  kind: z.enum(LEAD_KINDS),
  name: z.string().trim().min(2, { error: "required" }).max(120),
  phone: phoneSchema,
  email: z.union([z.literal(""), z.email({ error: "invalidEmail" }).max(200)]).default(""),
  source: z.string().regex(/^[a-z0-9_-]{2,40}$/, { error: "invalid" }),
  message: z.string().trim().max(2000).default(""),
  packageId: z.union([z.literal(""), uuid]).default(""),
  assignToMe: z.boolean().default(true),
});
export type ManualLeadInput = z.input<typeof manualLeadSchema>;

const rupees = z.coerce
  .number({ error: "invalid" })
  .min(0.01, { error: "invalid" })
  .max(10_000_000, { error: "invalid" })
  .transform((v) => Math.round(v * 100));

/** One quote line as the agent types it. */
export const quoteLineInputSchema = z.object({
  description: z.string().trim().min(2, { error: "required" }).max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  /** Rupees per unit, before GST → paise. */
  unitPrice: rupees,
  /** GST % → basis points. */
  taxPercent: z.coerce
    .number()
    .min(0)
    .max(28)
    .transform((v) => Math.round(v * 100)),
  sac: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, { error: "invalid" }),
});
export type QuoteLineInput = z.input<typeof quoteLineInputSchema>;
export type QuoteLineDraft = z.output<typeof quoteLineInputSchema>;

/** The quote builder. Pay now: the full total, or an advance in rupees. */
export const quoteFormSchema = z.object({
  quoteId: uuid.optional(),
  leadId: uuid,
  title: z.string().trim().min(2, { error: "required" }).max(160),
  lines: z.array(quoteLineInputSchema).min(1, { error: "required" }).max(30),
  payNow: z.enum(["full", "advance"]).default("full"),
  /** Rupees, when payNow = advance. */
  advance: z.union([z.literal(""), rupees]).default(""),
  validHours: z.coerce.number().int().min(1).max(720),
  notes: z.string().trim().max(2000).default(""),
  terms: z.string().trim().max(4000).default(""),
});
export type QuoteFormInput = z.input<typeof quoteFormSchema>;
export type QuoteForm = z.output<typeof quoteFormSchema>;

export const quoteIdSchema = z.object({ quoteId: uuid });

/** Money received for a sent quote outside Razorpay. */
export const quoteOfflinePaymentSchema = z.object({
  quoteId: uuid,
  amount: rupees,
  method: z.enum(["cash", "upi", "bank_transfer", "card", "other"]),
  reference: z.string().trim().max(120).default(""),
});
export type QuoteOfflinePaymentInput = z.input<typeof quoteOfflinePaymentSchema>;

export const quickReplySchema = z.object({ leadId: uuid, key: z.enum(QUICK_REPLIES) });
