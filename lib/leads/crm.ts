import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { getServices } from "@/lib/catalog/queries";
import { publicEnv } from "@/lib/env";
import { pickLocalized } from "@/lib/i18n/localized";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadActivityKind, LeadFilters, LeadStatus, QuoteStatus } from "@/schemas/leads";
import type { LeadKind } from "@/schemas/packages";
import type { Json, Tables } from "@/types/database";
import type { QuoteLine } from "./quote";
import { effectiveQuoteStatus } from "./quote";
import {
  BOARD_STATUSES,
  endOfIndiaDay,
  followUpState,
  leadReference,
  summarizeLead,
  type FollowUpState,
} from "./status";

/**
 * CRM reads for Admin → Leads. Leads are staff-only; these run with the
 * service role after a leads.read check so agent names (profiles) and
 * package titles can be joined without widening RLS.
 */

export const LEADS_PAGE_SIZE = 50;
/** The board shows at most this many cards per column (newest first). */
export const BOARD_LIMIT = 60;

export type StaffMember = { id: string; name: string; email: string | null };

export type LeadCard = {
  id: string;
  reference: string;
  kind: LeadKind;
  name: string;
  phone: string;
  status: LeadStatus;
  source: string;
  summary: string;
  assignedTo: string | null;
  assigneeName: string | null;
  valuePaise: number | null;
  nextFollowUpAt: string | null;
  followUp: FollowUpState | null;
  createdAt: string;
};

export type LeadList = {
  leads: LeadCard[];
  total: number;
  counts: Record<LeadStatus, number>;
  overdue: number;
};

type LeadRow = Tables<"leads">;

const asDetails = (v: Json): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[leads] ${scope}: ${error.message}`);
}

/** Staff who can work leads (any role holding leads.write), for assignment. */
export async function getLeadStaff(): Promise<StaffMember[]> {
  await assertPermission("leads.read");
  const admin = createAdminClient();
  const { data: perm } = await admin.from("permissions").select("id").eq("key", "leads.write").maybeSingle();
  if (!perm) return [];
  const { data: rp } = await admin.from("role_permissions").select("role_id").eq("permission_id", perm.id);
  const roleIds = (rp ?? []).map((r) => r.role_id);
  if (!roleIds.length) return [];
  const { data: ur } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
  const userIds = [...new Set((ur ?? []).map((u) => u.user_id))];
  if (!userIds.length) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, is_blocked, deleted_at")
    .in("id", userIds);
  return (profiles ?? [])
    .filter((p) => !p.is_blocked && !p.deleted_at)
    .map((p) => ({ id: p.id, name: p.full_name || p.email || "Staff", email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function namesFor(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name, email").in("id", wanted);
  return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email || "Staff"]));
}

async function labelsFor(rows: LeadRow[]) {
  const packageIds = [...new Set(rows.map((r) => r.package_id).filter((id): id is string => Boolean(id)))];
  const [pkgs, services] = await Promise.all([
    packageIds.length
      ? createAdminClient().from("packages").select("id, title").in("id", packageIds)
      : Promise.resolve({ data: [] as { id: string; title: { en: string } }[] }),
    rows.some((r) => r.service_slug) ? getServices() : Promise.resolve([]),
  ]);
  const pkgTitle = new Map((pkgs.data ?? []).map((p) => [p.id, p.title.en]));
  const serviceName = new Map(services.map((s) => [s.slug, pickLocalized(s.name, "en")]));
  return (r: LeadRow) =>
    summarizeLead({
      kind: r.kind,
      details: asDetails(r.details),
      packageTitle: r.package_id ? (pkgTitle.get(r.package_id) ?? null) : null,
      serviceName: r.service_slug ? (serviceName.get(r.service_slug) ?? null) : null,
    });
}

function toCard(r: LeadRow, summary: string, names: Map<string, string>, now: Date): LeadCard {
  return {
    id: r.id,
    reference: leadReference(r.number),
    kind: r.kind,
    name: r.name,
    phone: r.phone,
    status: r.status,
    source: r.source,
    summary,
    assignedTo: r.assigned_to,
    assigneeName: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
    valuePaise: r.value_paise,
    nextFollowUpAt: r.next_follow_up_at,
    followUp: followUpState(r.next_follow_up_at, r.status, now),
    createdAt: r.created_at,
  };
}

/** The pipeline: filtered leads (board: newest per status; list: one page) with counts per status. */
export async function listLeads(filters: LeadFilters): Promise<LeadList> {
  const session = await assertPermission("leads.read");
  const admin = createAdminClient();
  const now = new Date();

  const base = (head: boolean) => admin.from("leads").select("*", { count: "exact", head });
  type Query = ReturnType<typeof base>;

  // Filters shared by the rows and the per-status counts (status itself excluded from counts).
  const scoped = (q: Query): Query => {
    let out = q;
    if (filters.kind) out = out.eq("kind", filters.kind);
    if (filters.source) out = out.eq("source", filters.source);
    if (filters.assignee === "me") out = out.eq("assigned_to", session.user.id);
    else if (filters.assignee === "unassigned") out = out.is("assigned_to", null);
    else if (filters.assignee) out = out.eq("assigned_to", filters.assignee);
    if (filters.due) {
      out = out
        .in("status", ["new", "contacted", "quoted"])
        .lte("next_follow_up_at", (filters.due === "overdue" ? now : endOfIndiaDay(now)).toISOString());
    }
    if (filters.q) {
      const q = filters.q.replace(/[%,()]/g, " ").trim();
      const num = /^(ld-?)?0*(\d{1,9})$/i.exec(q)?.[2];
      out = out.or(
        [
          `name.ilike.%${q}%`,
          `phone.ilike.%${q.replace(/\s/g, "")}%`,
          `email.ilike.%${q}%`,
          num ? `number.eq.${num}` : null,
        ]
          .filter(Boolean)
          .join(","),
      );
    }
    return out;
  };

  let rowsQuery = scoped(base(false));
  if (filters.status) rowsQuery = rowsQuery.eq("status", filters.status);
  rowsQuery =
    filters.view === "list"
      ? rowsQuery
          .order("created_at", { ascending: false })
          .range((filters.page - 1) * LEADS_PAGE_SIZE, filters.page * LEADS_PAGE_SIZE - 1)
      : rowsQuery.order("created_at", { ascending: false }).limit(BOARD_LIMIT * 5);

  const [rows, overdue, ...statusCounts] = await Promise.all([
    rowsQuery,
    scoped(base(true))
      .in("status", ["new", "contacted", "quoted"])
      .lte("next_follow_up_at", now.toISOString()),
    ...BOARD_STATUSES.map((status) => scoped(base(true)).eq("status", status)),
  ]);
  if (rows.error) fail("list", rows.error);

  const data = rows.data ?? [];
  const [summary, names] = await Promise.all([labelsFor(data), namesFor(data.map((r) => r.assigned_to))]);
  const counts: Record<LeadStatus, number> = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
  BOARD_STATUSES.forEach((status, i) => (counts[status] = statusCounts[i]?.count ?? 0));

  let leads = data.map((r) => toCard(r, summary(r), names, now));
  if (filters.view !== "list") {
    // Cap each column so one busy status cannot crowd out the rest.
    const seen: Record<string, number> = {};
    leads = leads.filter((l) => (seen[l.status] = (seen[l.status] ?? 0) + 1) <= BOARD_LIMIT);
  }
  return { leads, total: rows.count ?? data.length, counts, overdue: overdue.count ?? 0 };
}

export type LeadActivityView = {
  id: string;
  kind: LeadActivityKind;
  body: string | null;
  callOutcome: string | null;
  callSeconds: number | null;
  meta: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
};

export type QuoteView = {
  id: string;
  number: number;
  status: QuoteStatus;
  title: string;
  lines: QuoteLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  payNowPaise: number;
  validUntil: string;
  notes: string | null;
  terms: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  paymentLinkUrl: string | null;
  /** The customer's no-login quote page, once sent (same URL the customer was sent). */
  pageUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type LeadDetail = LeadCard & {
  email: string | null;
  message: string | null;
  details: Record<string, unknown>;
  lostReason: string | null;
  utm: Record<string, unknown>;
  referrer: string | null;
  landingPath: string | null;
  serviceSlug: string | null;
  packageId: string | null;
  packageTitle: string | null;
  lastContactedAt: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  locale: "en" | "hi";
  userId: string | null;
  closedAt: string | null;
  activities: LeadActivityView[];
  quotes: QuoteView[];
};

/** /quote/<token> on the public site, in the lead's language (as in sendQuote). */
function quotePageUrl(token: string | null, locale: "en" | "hi"): string | null {
  if (!token) return null;
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return `${site}${locale === "hi" ? "/hi" : ""}/quote/${token}`;
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  await assertPermission("leads.read");
  const admin = createAdminClient();
  const { data: lead, error } = await admin.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) fail("lead", error);
  if (!lead) return null;
  const [acts, quotes, summary] = await Promise.all([
    admin
      .from("lead_activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("quotes").select("*").eq("lead_id", id).order("number", { ascending: false }),
    labelsFor([lead]),
  ]);
  if (acts.error) fail("activities", acts.error);
  if (quotes.error) fail("quotes", quotes.error);
  const bookingIds = [lead.booking_id, ...(quotes.data ?? []).map((q) => q.booking_id)].filter(
    (b): b is string => Boolean(b),
  );
  const [names, bookings, pkg] = await Promise.all([
    namesFor([lead.assigned_to, ...(acts.data ?? []).map((a) => a.actor)]),
    bookingIds.length
      ? admin.from("bookings").select("id, code").in("id", bookingIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    lead.package_id
      ? admin.from("packages").select("title").eq("id", lead.package_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const codes = new Map((bookings.data ?? []).map((b) => [b.id, b.code]));
  const now = new Date();
  return {
    ...toCard(lead, summary(lead), names, now),
    email: lead.email,
    message: lead.message,
    details: asDetails(lead.details),
    lostReason: lead.lost_reason,
    utm: asDetails(lead.utm),
    referrer: lead.referrer,
    landingPath: lead.landing_path,
    serviceSlug: lead.service_slug,
    packageId: lead.package_id,
    packageTitle: pkg.data?.title.en ?? null,
    lastContactedAt: lead.last_contacted_at,
    bookingId: lead.booking_id,
    bookingCode: lead.booking_id ? (codes.get(lead.booking_id) ?? null) : null,
    locale: lead.locale,
    userId: lead.user_id,
    closedAt: lead.closed_at,
    activities: (acts.data ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      callOutcome: a.call_outcome,
      callSeconds: a.call_seconds,
      meta: asDetails(a.meta),
      actorName: a.actor ? (names.get(a.actor) ?? null) : null,
      createdAt: a.created_at,
    })),
    quotes: (quotes.data ?? []).map((q) => ({
      id: q.id,
      number: q.number,
      status: effectiveQuoteStatus(q.status, q.valid_until, now),
      title: q.title,
      lines: (Array.isArray(q.lines) ? q.lines : []) as unknown as QuoteLine[],
      subtotalPaise: q.subtotal_paise,
      taxPaise: q.tax_paise,
      totalPaise: q.total_paise,
      payNowPaise: q.pay_now_paise,
      validUntil: q.valid_until,
      notes: q.notes,
      terms: q.terms,
      bookingId: q.booking_id,
      bookingCode: q.booking_id ? (codes.get(q.booking_id) ?? null) : null,
      paymentLinkUrl: q.payment_link_url,
      pageUrl: quotePageUrl(q.token, lead.locale),
      sentAt: q.sent_at,
      paidAt: q.paid_at,
      createdAt: q.created_at,
    })),
  };
}
