"use server";

import { randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { notifyBooking } from "@/lib/bookings/service";
import { generateBookingCode } from "@/lib/bookings/state";
import { publicEnv } from "@/lib/env";
import { razorpayConfig } from "@/lib/env.server";
import { formatPaise } from "@/lib/money";
import { renderTemplate } from "@/lib/notifications/render";
import { notify } from "@/lib/notifications/service";
import { RazorpayError, cancelPaymentLink, createPaymentLink } from "@/lib/payments/razorpay";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignLeadSchema,
  followUpSchema,
  leadActivitySchema,
  leadStatusSchema,
  manualLeadSchema,
  quickReplySchema,
  quoteFormSchema,
  quoteIdSchema,
  quoteOfflinePaymentSchema,
} from "@/schemas/leads";
import type { Json } from "@/types/database";
import { createLead, LeadError, notifyAssignee } from "./capture";
import { getLeadDetail } from "./crm";
import { payNowAmount, priceQuote } from "./quote";
import { whatsappLink } from "./status";

/**
 * Staff actions on leads and quotes (Admin → Leads). Every action checks
 * the permission on the server, validates with the shared zod schema and
 * calls a service-role SQL function that takes the staff member as
 * `p_actor`, so the audit log and the lead timeline record who did it.
 *
 * Errors are message keys under `leadsAdmin.errors`.
 */

export type LeadActionResult =
  | { ok: true; id?: string; reference?: string; quoteUrl?: string; payUrl?: string | null; warning?: string }
  | { ok: false; error: string; field?: string };

const DB_CODES: [string, string][] = [
  ["invalid_transition", "invalidTransition"],
  ["reason_required", "reasonRequired"],
  ["assignee_invalid", "assigneeInvalid"],
  ["lead_closed", "leadClosed"],
  ["quote_invalid", "quoteExpired"],
  ["totals_mismatch", "totalsMismatch"],
  ["overpaid", "overpaid"],
  ["not_found", "notFound"],
];

class ActionError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

function rpcError(error: { message: string }): ActionError {
  const hit = DB_CODES.find(([code]) => error.message.includes(code));
  if (!hit) console.error("[leads admin] database error", error);
  return new ActionError(hit?.[1] ?? "actionFailed");
}

async function leadAction<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  run: (data: z.output<S>, session: SessionContext) => Promise<LeadActionResult>,
): Promise<LeadActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  try {
    const result = await run(parsed.data, session);
    revalidatePath("/[locale]/admin/leads", "layout");
    return result;
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.key };
    if (error instanceof RazorpayError) return { ok: false, error: "paymentFailed" };
    console.error("[leads admin] action failed", error);
    return { ok: false, error: "actionFailed" };
  }
}

const sentSchema = z.object({ id: z.uuid(), code: z.string() });

const site = () => publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
const quoteUrl = (token: string, locale: "en" | "hi") =>
  `${site()}${locale === "hi" ? "/hi" : ""}/quote/${token}`;

function formatIndiaTime(iso: string, locale: "en" | "hi"): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------- leads

/** A lead typed in by an agent (call, WhatsApp, walk-in). */
export async function createManualLead(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", manualLeadSchema, input, async (data, session) => {
    try {
      const created = await createLead({
        kind: data.kind,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        message: data.message || null,
        details: {},
        packageId: data.packageId || null,
        userId: null,
        source: data.source,
        locale: "en",
        createdBy: session.user.id,
      });
      if (data.assignToMe && created.assignedTo !== session.user.id) {
        const { error } = await createAdminClient().rpc("assign_lead", {
          p_lead_id: created.id,
          p_assignee: session.user.id,
          p_actor: session.user.id,
        });
        if (error) throw rpcError(error);
      }
      return { ok: true, id: created.id, reference: created.reference };
    } catch (error) {
      if (error instanceof LeadError) {
        return { ok: false, error: error.code === "rate_limited" ? "rateLimited" : "actionFailed" };
      }
      throw error;
    }
  });
}

export async function assignLead(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", assignLeadSchema, input, async ({ leadId, assignee }, session) => {
    const { data, error } = await createAdminClient().rpc("assign_lead", {
      p_lead_id: leadId,
      p_assignee: assignee,
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    if (assignee && assignee !== session.user.id && data) {
      const lead = await getLeadDetail(leadId);
      if (lead) {
        await notifyAssignee(leadId, assignee, {
          name: lead.name,
          reference: lead.reference,
          summary: lead.summary,
          phone: lead.phone,
          source: lead.source,
        });
      }
    }
    return { ok: true, id: leadId };
  });
}

export async function setLeadStatus(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", leadStatusSchema, input, async ({ leadId, status, reason }, session) => {
    const { error } = await createAdminClient().rpc("set_lead_status", {
      p_lead_id: leadId,
      p_status: status,
      p_actor: session.user.id,
      p_reason: reason || null,
    });
    if (error) throw rpcError(error);
    return { ok: true, id: leadId };
  });
}

export async function logLeadActivity(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", leadActivitySchema, input, async (data, session) => {
    const { data: id, error } = await createAdminClient().rpc("log_lead_activity", {
      p_lead_id: data.leadId,
      p_kind: data.kind,
      p_body: data.body || null,
      p_actor: session.user.id,
      p_call_outcome: data.callOutcome ?? null,
      p_call_seconds: data.callMinutes === undefined ? null : Math.round(data.callMinutes * 60),
      p_follow_up: data.followUpAt ?? null,
    });
    if (error) throw rpcError(error);
    return { ok: true, id: id ?? undefined };
  });
}

/** Sets or clears the next follow-up reminder (logged on the timeline). */
export async function setFollowUp(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", followUpSchema, input, async ({ leadId, at, note }, session) => {
    const body = at ? note || "Follow-up scheduled" : note || "Follow-up cleared";
    const { error } = await createAdminClient().rpc("log_lead_activity", {
      p_lead_id: leadId,
      p_kind: "follow_up",
      p_body: body,
      p_actor: session.user.id,
      p_follow_up: at,
      p_clear_follow_up: at === null,
    });
    if (error) throw rpcError(error);
    return { ok: true, id: leadId };
  });
}

/** A quick-reply message filled in for this lead, ready to open in WhatsApp (or email). */
export async function quickReply(
  input: unknown,
): Promise<
  { ok: true; text: string; whatsappUrl: string; mailto: string | null } | { ok: false; error: string }
> {
  let session: SessionContext;
  try {
    session = await assertPermission("leads.read");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = quickReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const lead = await getLeadDetail(parsed.data.leadId);
  if (!lead) return { ok: false, error: "notFound" };
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("notification_templates")
    .select("channel, locale, subject, body")
    .eq("key", parsed.data.key)
    .eq("is_active", true);
  const pick = (channel: "whatsapp" | "email") =>
    (rows ?? []).find((r) => r.channel === channel && r.locale === lead.locale) ??
    (rows ?? []).find((r) => r.channel === channel && r.locale === "en");
  const whatsapp = pick("whatsapp");
  if (!whatsapp) return { ok: false, error: "noTemplate" };

  const { data: me } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .maybeSingle();
  const quote = lead.quotes.find((q) => q.status === "sent");
  const { data: token } = quote
    ? await admin.from("quotes").select("token").eq("id", quote.id).maybeSingle()
    : { data: null };
  const values = {
    name: lead.name,
    reference: lead.reference,
    summary: lead.summary,
    agent: me?.full_name || "our travel desk",
    title: quote?.title ?? "",
    total: quote ? formatPaise(quote.totalPaise, lead.locale) : "",
    pay_now: quote ? formatPaise(quote.payNowPaise, lead.locale) : "",
    valid_until: quote ? formatIndiaTime(quote.validUntil, lead.locale) : "",
    quote_url: token?.token ? quoteUrl(token.token, lead.locale) : "",
  };
  const text = renderTemplate(whatsapp.body, values);
  const email = pick("email");
  const mailto =
    email && lead.email
      ? `mailto:${lead.email}?subject=${encodeURIComponent(renderTemplate(email.subject ?? "", values))}&body=${encodeURIComponent(renderTemplate(email.body, values))}`
      : null;
  return { ok: true, text, whatsappUrl: whatsappLink(lead.phone, text), mailto };
}

// ---------------------------------------------------------------- quotes

/** Saves a draft quote; prices are recomputed here from the typed lines. */
export async function saveQuote(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", quoteFormSchema, input, async (data, session) => {
    const priced = priceQuote(data.lines);
    const payNow = payNowAmount(priced.totalPaise, data.payNow, data.advance);
    if (!payNow.ok) {
      return {
        ok: false,
        error: payNow.error === "advance_required" ? "advanceRequired" : "advanceTooHigh",
        field: "advance",
      };
    }
    const { data: id, error } = await createAdminClient().rpc("save_quote", {
      p: {
        id: data.quoteId ?? null,
        lead_id: data.leadId,
        title: data.title,
        lines: priced.lines,
        subtotal_paise: priced.subtotalPaise,
        tax_paise: priced.taxPaise,
        total_paise: priced.totalPaise,
        pay_now_paise: payNow.paise,
        valid_until: new Date(Date.now() + data.validHours * 3_600_000).toISOString(),
        notes: data.notes,
        terms: data.terms,
      },
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    return { ok: true, id: id ?? undefined };
  });
}

/**
 * Sends a draft quote: writes the unpaid booking, opens a Razorpay Payment
 * Link for the pay-now amount (when Razorpay is set up) and messages the
 * customer the quote page. Without Razorpay the quote is still sent and
 * staff record the payment by hand.
 */
export async function sendQuote(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", quoteIdSchema, input, async ({ quoteId }, session) => {
    const admin = createAdminClient();
    const { data: quote } = await admin.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (!quote) return { ok: false, error: "notFound" };
    const lead = await getLeadDetail(quote.lead_id);
    if (!lead) return { ok: false, error: "notFound" };
    // Earlier sent quotes get withdrawn by send_quote; remember their links to cancel at Razorpay.
    const openBookings = lead.quotes
      .filter((q) => q.status === "sent" && q.id !== quoteId)
      .flatMap((q) => (q.bookingId ? [q.bookingId] : []));
    const { data: previous } = openBookings.length
      ? await admin
          .from("payments")
          .select("payment_link_id")
          .in("booking_id", openBookings)
          .eq("status", "created")
          .not("payment_link_id", "is", null)
      : { data: [] as { payment_link_id: string | null }[] };

    const token = randomBytes(24).toString("hex");
    const lines = (Array.isArray(quote.lines) ? quote.lines : []) as {
      key?: string;
      description?: string;
      quantity?: number;
      amount_paise?: number;
      tax_rate_bps?: number;
      tax_paise?: number;
      sac?: string;
    }[];
    const priceLines = lines.map((l, i) => ({
      key: l.key ?? `line:${i + 1}`,
      kind: "service",
      description: l.description ?? "",
      date: null,
      roomId: null,
      ratePlanId: null,
      quantity: l.quantity ?? 1,
      amountPaise: l.amount_paise ?? 0,
      sac: l.sac ?? "",
      discountPaise: 0,
      taxRateBps: l.tax_rate_bps ?? 0,
      taxPaise: l.tax_paise ?? 0,
    }));
    const snapshot: Json = {
      quote: {
        id: quote.id,
        number: quote.number,
        title: quote.title,
        notes: quote.notes,
        terms: quote.terms,
      },
      lead: { id: lead.id, reference: lead.reference, kind: lead.kind },
      trip: { label: quote.title, route: lead.summary, vehicle: "" },
    };

    let booking: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 3 && !booking; attempt++) {
      const { data, error } = await admin.rpc("send_quote", {
        p_quote_id: quoteId,
        p_booking: {
          code: generateBookingCode(randomInt),
          price_breakdown: { lines: priceLines, quoteId: quote.id },
          snapshot,
        },
        p_token: token,
        p_actor: session.user.id,
      });
      if (error) {
        if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
        throw rpcError(error);
      }
      booking = sentSchema.parse(data);
    }
    if (!booking) throw new ActionError("actionFailed");

    const config = razorpayConfig();
    for (const p of previous ?? []) {
      if (config && p.payment_link_id)
        await cancelPaymentLink(config, p.payment_link_id).catch(() => undefined);
    }

    const page = quoteUrl(token, lead.locale);
    let payUrl: string | null = null;
    let warning: string | undefined;
    if (config) {
      try {
        const expireBy = Math.floor(Date.parse(quote.valid_until) / 1000);
        const link = await createPaymentLink(config, {
          amountPaise: quote.pay_now_paise,
          referenceId: `${booking.code}-Q${quote.number}`,
          description: quote.title.slice(0, 200),
          customer: { name: lead.name, email: lead.email, contact: lead.phone },
          callbackUrl: page,
          expireBy,
          notes: { booking: booking.code, lead: lead.reference },
        });
        const { error } = await admin.rpc("create_payment_link_payment", {
          p_booking_id: booking.id,
          p_link_id: link.id,
          p_url: link.short_url,
          p_amount: quote.pay_now_paise,
          p_actor: session.user.id,
        });
        if (error) throw rpcError(error);
        await admin.rpc("attach_quote_link", { p_quote_id: quoteId, p_url: link.short_url });
        payUrl = link.short_url;
      } catch (error) {
        console.error("[leads admin] payment link failed", error);
        warning = "linkFailed";
      }
    } else {
      warning = "paymentsDisabled";
    }

    await notify({
      key: "quote.sent",
      locale: lead.locale,
      to: { email: lead.email, phone: lead.phone, userId: lead.userId },
      values: {
        name: lead.name,
        title: quote.title,
        total: formatPaise(quote.total_paise, lead.locale),
        pay_now: formatPaise(quote.pay_now_paise, lead.locale),
        valid_until: formatIndiaTime(quote.valid_until, lead.locale),
        quote_url: page,
        pay_url: payUrl ?? page,
        reference: lead.reference,
      },
      bookingId: booking.id,
    });
    return { ok: true, id: quoteId, quoteUrl: page, payUrl, warning };
  });
}

/** Withdraws a draft or sent quote; a sent quote's booking is cancelled and its link cancelled at Razorpay. */
export async function cancelQuote(input: unknown): Promise<LeadActionResult> {
  return leadAction("leads.write", quoteIdSchema, input, async ({ quoteId }, session) => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cancel_quote", {
      p_quote_id: quoteId,
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    const config = razorpayConfig();
    if (config && data?.booking_id) {
      const { data: links } = await admin
        .from("payments")
        .select("payment_link_id")
        .eq("booking_id", data.booking_id)
        .eq("status", "created")
        .not("payment_link_id", "is", null);
      for (const l of links ?? []) {
        if (l.payment_link_id) await cancelPaymentLink(config, l.payment_link_id).catch(() => undefined);
      }
    }
    return { ok: true, id: quoteId };
  });
}

/** Money received for a sent quote outside Razorpay (cash, UPI to the office, bank transfer). */
export async function recordQuotePayment(input: unknown): Promise<LeadActionResult> {
  return leadAction("payments.write", quoteOfflinePaymentSchema, input, async (data, session) => {
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_quote_offline_payment", {
      p_quote_id: data.quoteId,
      p_amount: data.amount,
      p_method: data.method,
      p_reference: data.reference || null,
      p_actor: session.user.id,
    });
    if (error) throw rpcError(error);
    const { data: quote } = await admin
      .from("quotes")
      .select("booking_id")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (quote?.booking_id) await notifyBooking(quote.booking_id, "booking.confirmed");
    return { ok: true, id: data.quoteId };
  });
}
