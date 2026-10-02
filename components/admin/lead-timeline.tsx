import {
  AlarmClock,
  ArrowRightLeft,
  Bot,
  FileText,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  StickyNote,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { LeadActivityView } from "@/lib/leads/crm";
import { formatPaise } from "@/lib/money";
import { LEAD_STATUSES, type LeadActivityKind, type LeadStatus } from "@/schemas/leads";
import { leadTime } from "./lead-board";

const ICONS: Record<LeadActivityKind, LucideIcon> = {
  note: StickyNote,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  sms: MessageSquareText,
  status: ArrowRightLeft,
  assignment: UserRoundCheck,
  quote: FileText,
  follow_up: AlarmClock,
  system: Bot,
};

const isStatus = (v: unknown): v is LeadStatus =>
  typeof v === "string" && LEAD_STATUSES.includes(v as LeadStatus);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Everything that happened on a lead, newest first: notes, contacts, moves, quotes, system events. */
export async function LeadTimeline({
  activities,
  staffNames,
}: {
  activities: LeadActivityView[];
  /** Staff id → name, for assignment entries. */
  staffNames: Record<string, string>;
}) {
  const [t, format, locale] = await Promise.all([getTranslations("leadsAdmin"), getFormatter(), getLocale()]);
  if (activities.length === 0) return <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>;

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {activities.map((a) => {
        const Icon = ICONS[a.kind];
        const from = a.meta.from;
        const to = a.meta.to;
        const followUp = str(a.meta.follow_up);
        const totalPaise = typeof a.meta.total_paise === "number" ? a.meta.total_paise : null;
        const details: string[] = [];
        if (a.kind === "call") {
          if (a.callOutcome) {
            details.push(
              t.has(`callOutcomes.${a.callOutcome}`) ? t(`callOutcomes.${a.callOutcome}`) : a.callOutcome,
            );
          }
          if (a.callSeconds)
            details.push(t("timeline.minutes", { minutes: Math.max(1, Math.round(a.callSeconds / 60)) }));
        }
        if (a.kind === "status" && isStatus(from) && isStatus(to)) {
          details.push(`${t(`status.${from}`)} → ${t(`status.${to}`)}`);
        }
        if (a.kind === "assignment") {
          const id = str(to);
          details.push(
            id ? t("timeline.assignedTo", { name: staffNames[id] ?? "–" }) : t("timeline.unassigned"),
          );
        }
        if (a.kind === "quote" && totalPaise !== null) details.push(formatPaise(totalPaise, locale));
        if (a.kind === "system" && str(a.meta.source))
          details.push(t("timeline.via", { source: str(a.meta.source) ?? "" }));

        return (
          <li key={a.id} className="relative">
            <span className="absolute top-0.5 -left-[2.06rem] grid size-7 place-items-center rounded-full border bg-card text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{t(`activity.${a.kind}`)}</span>
              {details.length ? <span>{details.join(" · ")}</span> : null}
            </div>
            {/* Assignment bodies are the server's English labels; the details line already says it. */}
            {a.body && a.kind !== "assignment" ? (
              <p className="mt-1 text-sm break-words whitespace-pre-line">{a.body}</p>
            ) : null}
            {followUp ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("timeline.followUpSet", { date: leadTime(format, followUp) })}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {leadTime(format, a.createdAt)} · {a.actorName ?? t("timeline.system")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
