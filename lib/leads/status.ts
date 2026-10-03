import { addDays, todayInIndia } from "@/lib/dates";
import type { LeadStatus } from "@/schemas/leads";
import type { LeadKind } from "@/schemas/packages";

/** Lead pipeline rules shared by the CRM board, the lead page and the server actions. Mirrors set_lead_status. */

export const BOARD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
export const OPEN_STATUSES: readonly LeadStatus[] = ["new", "contacted", "quoted"];

const MANUAL_NEXT: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "won", "lost"],
  contacted: ["won", "lost"],
  // Back to Contacted when the customer wants changes before a new quote.
  quoted: ["contacted", "won", "lost"],
  won: [],
  // Reopen.
  lost: ["contacted"],
};

/** Moves an agent can make by hand (Quoted comes from sending a quote). */
export function manualNext(status: LeadStatus): LeadStatus[] {
  return MANUAL_NEXT[status];
}

export function isOpen(status: LeadStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Leads read as LD-00042. */
export function leadReference(number: number): string {
  return `LD-${String(number).padStart(5, "0")}`;
}

export type FollowUpState = "overdue" | "today" | "upcoming";

/** Where a follow-up stands, in India time. Null when none is set or the lead is closed. */
export function followUpState(
  nextFollowUpAt: string | null,
  status: LeadStatus,
  now: Date = new Date(),
): FollowUpState | null {
  if (!nextFollowUpAt || !isOpen(status)) return null;
  const due = new Date(nextFollowUpAt);
  if (due.getTime() <= now.getTime()) return "overdue";
  return todayInIndia(due) === todayInIndia(now) ? "today" : "upcoming";
}

/** End of today in India (UTC instant), for the "due today" filter. */
export function endOfIndiaDay(now: Date = new Date()): Date {
  const tomorrow = addDays(todayInIndia(now), 1);
  // Midnight IST = 18:30 UTC the previous day.
  return new Date(`${tomorrow}T00:00:00+05:30`);
}

type Details = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

const KIND_LABEL: Record<LeadKind, string> = {
  package: "Tour package",
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  hotel: "Hotel",
  cab: "Cab",
  service: "Service",
  general: "General enquiry",
};

/** One-line English summary for messages and the board: "Flight DEL → VNS · 12 Oct · 2 adults". */
export function summarizeLead(lead: {
  kind: LeadKind;
  details: Details;
  packageTitle?: string | null;
  serviceName?: string | null;
}): string {
  const d = lead.details;
  const parts: string[] = [];
  if (lead.kind === "package") parts.push(lead.packageTitle || KIND_LABEL.package);
  else if (lead.kind === "service") parts.push(lead.serviceName || KIND_LABEL.service);
  else if (lead.kind === "flight" || lead.kind === "train" || lead.kind === "bus") {
    const route = str(d.from) && str(d.to) ? ` ${str(d.from)} → ${str(d.to)}` : "";
    parts.push(`${KIND_LABEL[lead.kind]}${route}`);
  } else parts.push(KIND_LABEL[lead.kind]);
  // A plan picked on a B2B service page (stored by submitEnquiry).
  if (str(d.plan)) parts.push(str(d.plan));
  const date = str(d.depart_on) || str(d.start_date);
  if (date)
    parts.push(formatShortDate(date) + (str(d.return_on) ? ` – ${formatShortDate(str(d.return_on))}` : ""));
  const adults = Number(d.adults) || 0;
  const children = Number(d.children) || 0;
  if (adults)
    parts.push(
      `${adults} adult${adults === 1 ? "" : "s"}${children ? ` + ${children} child${children === 1 ? "" : "ren"}` : ""}`,
    );
  return parts.join(" · ");
}

function formatShortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** wa.me link with the message filled in. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;
}
