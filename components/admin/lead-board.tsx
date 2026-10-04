import { AlarmClock, CalendarClock, LayoutGrid, List, Search, X } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import type { LeadCard, StaffMember } from "@/lib/leads/crm";
import { BOARD_STATUSES } from "@/lib/leads/status";
import {
  followUpTone,
  groupLeadsByStatus,
  hasLeadFilters,
  leadFiltersQuery,
  leadStatusTone,
} from "@/lib/leads/ui";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES, type LeadFilters, type LeadStatus } from "@/schemas/leads";
import { LEAD_KINDS } from "@/schemas/packages";
import { ToneBadge } from "./booking-status";
import { LeadStatusMenu } from "./lead-status-menu";
import { MoreFilters } from "./more-filters";
import { ScrollRow } from "./scroll-row";

type Format = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Follow-ups are shown in India time whatever the viewer's zone. */
export function leadTime(format: Format, iso: string | null): string {
  return iso
    ? format.dateTime(new Date(iso), {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "–";
}

/** A source key in words ("walk_in" → "Walk-in"); sources added in Settings show as typed. */
export function sourceLabel(t: Translate, source: string): string {
  return t.has(`sources.${source}`) ? t(`sources.${source}`) : source;
}

export function LeadStatusBadge({ status, label }: { status: LeadStatus; label: string }) {
  return <ToneBadge tone={leadStatusTone(status)} label={label} />;
}

/** "Overdue · 2 Oct, 3:00 pm" / "Today · 5:30 pm"; nothing when no follow-up is due. */
export function FollowUpBadge({
  lead,
  t,
  format,
}: {
  lead: Pick<LeadCard, "followUp" | "nextFollowUpAt">;
  t: Translate;
  format: Format;
}) {
  if (!lead.followUp) return null;
  return (
    <ToneBadge
      tone={followUpTone(lead.followUp)}
      label={`${t(`followUp.${lead.followUp}`)} · ${leadTime(format, lead.nextFollowUpAt)}`}
    />
  );
}

/** One lead on the board; the card opens the lead, the status menu moves it. */
async function LeadBoardCard({
  lead,
  canWrite,
  lostReasons,
}: {
  lead: LeadCard;
  canWrite: boolean;
  lostReasons: string[];
}) {
  const [t, format, locale] = await Promise.all([getTranslations("leadsAdmin"), getFormatter(), getLocale()]);
  return (
    <li className="relative grid gap-2 rounded-2xl border bg-card p-3 text-sm transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">
            <Link href={`/admin/leads/${lead.id}`} className="after:absolute after:inset-0">
              {lead.name}
            </Link>
          </p>
          <p className="font-mono text-xs text-muted-foreground">{lead.reference}</p>
        </div>
        {lead.valuePaise ? (
          <span className="shrink-0 font-medium">{formatPaise(lead.valuePaise, locale)}</span>
        ) : null}
      </div>
      {lead.summary ? <p className="break-words">{lead.summary}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">{sourceLabel(t, lead.source)}</span>
        <span aria-hidden="true">·</span>
        {lead.assigneeName ? (
          <span>{lead.assigneeName}</span>
        ) : (
          <span className="text-accent-amber">{t("board.unassigned")}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FollowUpBadge lead={lead} t={t} format={format} />
        {canWrite ? (
          <div className="relative z-10 ml-auto">
            <LeadStatusMenu leadId={lead.id} status={lead.status} lostReasons={lostReasons} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The pipeline as columns New → Lost with the count per status. On small
 * screens the columns scroll sideways (one column per swipe); from xl they
 * sit side by side.
 */
export async function LeadBoard({
  leads,
  counts,
  canWrite,
  lostReasons,
  limit,
}: {
  leads: LeadCard[];
  counts: Record<LeadStatus, number>;
  canWrite: boolean;
  lostReasons: string[];
  /** Cards shown per column at most (BOARD_LIMIT). */
  limit: number;
}) {
  const t = await getTranslations("leadsAdmin");
  const groups = groupLeadsByStatus(leads);
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
      {BOARD_STATUSES.map((status) => {
        const rows = groups[status];
        return (
          <section
            key={status}
            aria-labelledby={`lead-col-${status}`}
            className="w-[85vw] max-w-80 shrink-0 snap-start space-y-3 rounded-2xl bg-muted/40 p-3 sm:w-72 xl:w-auto xl:max-w-none"
          >
            <h2 id={`lead-col-${status}`} className="flex items-center gap-2 text-base font-semibold">
              <LeadStatusBadge status={status} label={t(`status.${status}`)} />
              <span className="rounded-full bg-background px-2 text-sm font-medium text-muted-foreground">
                {counts[status]}
              </span>
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("board.emptyColumn")}</p>
            ) : (
              <ul className="space-y-3">
                {rows.map((lead) => (
                  <LeadBoardCard key={lead.id} lead={lead} canWrite={canWrite} lostReasons={lostReasons} />
                ))}
              </ul>
            )}
            {counts[status] > rows.length && rows.length >= limit ? (
              <p className="text-xs text-muted-foreground">
                {t("board.showingNewest", { count: rows.length })}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** List view: one page of leads as a table (paged in the database). */
export async function LeadTable({ leads }: { leads: LeadCard[] }) {
  const [t, format, locale] = await Promise.all([getTranslations("leadsAdmin"), getFormatter(), getLocale()]);
  if (leads.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{t("list.empty")}</p>
    );
  }
  return (
    <>
      <ul className="grid gap-2 md:hidden">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="relative grid gap-2 rounded-2xl border bg-card p-4 text-sm active:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold break-words">
                  <Link href={`/admin/leads/${lead.id}`} className="after:absolute after:inset-0">
                    {lead.name}
                  </Link>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {lead.reference} · {lead.phone}
                </p>
              </div>
              <LeadStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />
            </div>
            <p className="break-words">{lead.summary || t(`kinds.${lead.kind}`)}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5">{sourceLabel(t, lead.source)}</span>
              <span aria-hidden="true">·</span>
              {lead.assigneeName ?? <span className="text-accent-amber">{t("board.unassigned")}</span>}
              {lead.valuePaise ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-foreground">{formatPaise(lead.valuePaise, locale)}</span>
                </>
              ) : null}
            </div>
            {lead.followUp ? <FollowUpBadge lead={lead} t={t} format={format} /> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">{t("columns.lead")}</th>
              <th className="px-4 py-3">{t("columns.summary")}</th>
              <th className="px-4 py-3">{t("columns.status")}</th>
              <th className="px-4 py-3">{t("columns.source")}</th>
              <th className="px-4 py-3">{t("columns.assignee")}</th>
              <th className="px-4 py-3">{t("columns.value")}</th>
              <th className="px-4 py-3">{t("columns.followUp")}</th>
              <th className="px-4 py-3">{t("columns.created")}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="inline-flex min-h-11 flex-col justify-center font-medium text-primary"
                  >
                    {lead.name}
                    <span className="font-mono text-xs text-muted-foreground">
                      {lead.reference} · {lead.phone}
                    </span>
                  </Link>
                </td>
                <td className="min-w-48 px-4 py-2.5">{lead.summary || t(`kinds.${lead.kind}`)}</td>
                <td className="px-4 py-2.5">
                  <LeadStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />
                </td>
                <td className="px-4 py-2.5">{sourceLabel(t, lead.source)}</td>
                <td className="px-4 py-2.5">
                  {lead.assigneeName ?? <span className="text-accent-amber">{t("board.unassigned")}</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {lead.valuePaise ? formatPaise(lead.valuePaise, locale) : "–"}
                </td>
                <td className="px-4 py-2.5">
                  {lead.followUp ? <FollowUpBadge lead={lead} t={t} format={format} /> : "–"}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {format.dateTime(new Date(lead.createdAt), {
                    day: "numeric",
                    month: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Board / list toggle and the follow-up chips (overdue count, due today). */
export async function LeadViewBar({ filters, overdue }: { filters: LeadFilters; overdue: number }) {
  const t = await getTranslations("leadsAdmin");
  const pill = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-accent",
    );
  return (
    <ScrollRow className="-mx-4 sm:mx-0" innerClassName="items-center gap-2 px-4 pb-1 sm:flex-wrap sm:px-0">
      <nav aria-label={t("view.label")} className="flex shrink-0 gap-1">
        <Link
          href={`/admin/leads${leadFiltersQuery(filters, { view: "board", page: 1 })}`}
          aria-current={filters.view === "board" ? "page" : undefined}
          className={pill(filters.view === "board")}
        >
          <LayoutGrid className="size-4" aria-hidden="true" /> {t("view.board")}
        </Link>
        <Link
          href={`/admin/leads${leadFiltersQuery(filters, { view: "list", page: 1 })}`}
          aria-current={filters.view === "list" ? "page" : undefined}
          className={pill(filters.view === "list")}
        >
          <List className="size-4" aria-hidden="true" /> {t("view.list")}
        </Link>
      </nav>
      <Link
        href={`/admin/leads${leadFiltersQuery(filters, { due: filters.due === "overdue" ? undefined : "overdue", page: 1 })}`}
        aria-current={filters.due === "overdue" ? "true" : undefined}
        className={cn(
          pill(filters.due === "overdue"),
          overdue > 0 && filters.due !== "overdue" && "border-destructive/40 text-destructive",
        )}
      >
        <AlarmClock className="size-4" aria-hidden="true" /> {t("view.overdue", { count: overdue })}
      </Link>
      <Link
        href={`/admin/leads${leadFiltersQuery(filters, { due: filters.due === "today" ? undefined : "today", page: 1 })}`}
        aria-current={filters.due === "today" ? "true" : undefined}
        className={pill(filters.due === "today")}
      >
        <CalendarClock className="size-4" aria-hidden="true" /> {t("view.dueToday")}
      </Link>
    </ScrollRow>
  );
}

/** Pipeline filters as a plain GET form: a filtered board is a shareable URL and works without JS. */
export async function LeadFiltersForm({
  filters,
  sources,
  staff,
}: {
  filters: LeadFilters;
  sources: string[];
  staff: StaffMember[];
}) {
  const t = await getTranslations("leadsAdmin");
  // A source no longer listed in Settings still shows when it is the active filter.
  const sourceOptions =
    filters.source && !sources.includes(filters.source) ? [...sources, filters.source] : sources;
  return (
    <form
      method="get"
      role="search"
      className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      {filters.view === "list" ? <input type="hidden" name="view" value="list" /> : null}
      <div className="grid gap-1.5 sm:col-span-2 lg:col-span-5">
        <Label htmlFor="lf-q">{t("filters.search")}</Label>
        <Input
          id="lf-q"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder={t("filters.searchPlaceholder")}
        />
      </div>
      <MoreFilters
        active={
          [filters.status, filters.kind, filters.source, filters.assignee, filters.due].filter(Boolean).length
        }
      >
        <div className="grid gap-1.5">
          <Label htmlFor="lf-status">{t("filters.status")}</Label>
          <NativeSelect id="lf-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("filters.any")}</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-kind">{t("filters.kind")}</Label>
          <NativeSelect id="lf-kind" name="kind" defaultValue={filters.kind ?? ""}>
            <option value="">{t("filters.any")}</option>
            {LEAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-source">{t("filters.source")}</Label>
          <NativeSelect id="lf-source" name="source" defaultValue={filters.source ?? ""}>
            <option value="">{t("filters.any")}</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(t, s)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-assignee">{t("filters.assignee")}</Label>
          <NativeSelect id="lf-assignee" name="assignee" defaultValue={filters.assignee ?? ""}>
            <option value="">{t("filters.anyone")}</option>
            <option value="me">{t("filters.me")}</option>
            <option value="unassigned">{t("filters.unassigned")}</option>
            {staff.length ? (
              <optgroup label={t("filters.staff")}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-due">{t("filters.due")}</Label>
          <NativeSelect id="lf-due" name="due" defaultValue={filters.due ?? ""}>
            <option value="">{t("filters.any")}</option>
            <option value="overdue">{t("followUp.overdue")}</option>
            <option value="today">{t("filters.dueToday")}</option>
          </NativeSelect>
        </div>
      </MoreFilters>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="submit" className="flex-1 sm:flex-none">
          <Search /> {t("filters.apply")}
        </Button>
        {hasLeadFilters(filters) ? (
          <Button asChild variant="ghost">
            <Link href={`/admin/leads${leadFiltersQuery({ view: filters.view })}`}>
              <X /> {t("filters.clear")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
