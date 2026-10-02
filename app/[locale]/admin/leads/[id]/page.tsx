import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { LeadAssignee, LeadContact } from "@/components/admin/lead-actions";
import { FollowUpBadge, LeadStatusBadge, leadTime, sourceLabel } from "@/components/admin/lead-board";
import { LeadFollowUp } from "@/components/admin/lead-follow-up";
import { LeadLogForm } from "@/components/admin/lead-log-form";
import { LeadQuotes } from "@/components/admin/lead-quotes";
import { LeadStatusMenu } from "@/components/admin/lead-status-menu";
import { LeadTimeline } from "@/components/admin/lead-timeline";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getLeadDetail, getLeadStaff } from "@/lib/leads/crm";
import { getLeadsSettings } from "@/lib/leads/settings";
import { isOpen } from "@/lib/leads/status";
import { leadTravelFacts, utmEntries } from "@/lib/leads/ui";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/constants";

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-2xl border bg-card p-4 ${className ?? ""}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One lead: who and what they asked for, where they came from, the next
 * follow-up, the timeline with a log form, and quotes with the builder.
 * Controls the user lacks permission for are not rendered; the server
 * actions re-check anyway.
 */
export default async function AdminLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("leads.read", `/admin/leads/${id}`);
  const [lead, staff, settings, t, format, locale] = await Promise.all([
    getLeadDetail(id),
    getLeadStaff(),
    getLeadsSettings(),
    getTranslations("leadsAdmin"),
    getFormatter(),
    getLocale(),
  ]);
  if (!lead) notFound();

  const can = (p: PermissionKey) => hasPermission(session.permissions, p);
  const canWrite = can("leads.write");
  const open = isOpen(lead.status);
  const day = (iso: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
      : iso;
  const travel = leadTravelFacts(lead.details);
  const utm = utmEntries(lead.utm);
  const staffNames = Object.fromEntries([
    ...staff.map((s) => [s.id, s.name] as const),
    ...(lead.assignedTo && lead.assigneeName ? [[lead.assignedTo, lead.assigneeName] as const] : []),
  ]);
  const optional = (label: string, value: ReactNode | null | undefined): [string, ReactNode][] =>
    value ? [[label, value]] : [];
  const bookingLink = (bookingId: string, code: string) =>
    can("bookings.read") ? (
      <Link href={`/admin/bookings/${bookingId}`} className="font-mono text-primary">
        {code}
      </Link>
    ) : (
      <span className="font-mono">{code}</span>
    );

  return (
    <div className="space-y-6">
      <AdminPageHeader title={lead.name} backHref="/admin/leads" backLabel={t("detail.backToList")}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{lead.reference}</span>
          <LeadStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />
          <span>{t(`kinds.${lead.kind}`)}</span>
          <span aria-hidden="true">·</span>
          <span>{t("detail.created", { date: leadTime(format, lead.createdAt) })}</span>
          {lead.valuePaise ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-foreground">{formatPaise(lead.valuePaise, locale)}</span>
            </>
          ) : null}
        </div>
        {canWrite ? (
          <LeadStatusMenu
            leadId={lead.id}
            status={lead.status}
            lostReasons={settings.lost_reasons}
            variant="buttons"
          />
        ) : null}
        <LeadContact
          leadId={lead.id}
          phone={lead.phone}
          email={lead.email}
          hasSentQuote={lead.quotes.some((q) => q.status === "sent")}
          canWrite={canWrite}
        />
        <LeadAssignee
          leadId={lead.id}
          assignedTo={lead.assignedTo}
          assigneeName={lead.assigneeName}
          staff={staff.map((s) => ({ value: s.id, label: s.name }))}
          canWrite={canWrite}
        />
      </AdminPageHeader>

      {lead.status === "won" ? (
        <p className="rounded-2xl border border-accent-green/30 bg-accent-green/10 p-4 text-sm">
          {t("detail.wonOn", { date: leadTime(format, lead.closedAt) })}
          {lead.bookingId && lead.bookingCode ? (
            <>
              {" "}
              {t("detail.booking")} {bookingLink(lead.bookingId, lead.bookingCode)}
            </>
          ) : null}
        </p>
      ) : null}
      {lead.status === "lost" ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {t("detail.lostOn", { date: leadTime(format, lead.closedAt) })}
          {lead.lostReason ? ` — ${lead.lostReason}` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title={t("timeline.title")}>
            {canWrite ? (
              <div className="rounded-xl border p-3">
                <LeadLogForm leadId={lead.id} />
              </div>
            ) : null}
            <LeadTimeline activities={lead.activities} staffNames={staffNames} />
          </Section>

          <Section title={t("quotes.title")}>
            <LeadQuotes
              leadId={lead.id}
              quotes={lead.quotes}
              settings={{
                quote_tax_bps: settings.quote_tax_bps,
                quote_sac: settings.quote_sac,
                quote_valid_hours: settings.quote_valid_hours,
              }}
              defaultTitle={lead.packageTitle ?? lead.summary}
              leadOpen={open}
              canWrite={canWrite}
              canPay={can("payments.write")}
              canViewBookings={can("bookings.read")}
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title={t("followUpCard.title")}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("followUpCard.next")}</span>
              {lead.nextFollowUpAt && open ? (
                <>
                  <span className="font-medium">{leadTime(format, lead.nextFollowUpAt)}</span>
                  <FollowUpBadge lead={lead} t={t} format={format} />
                </>
              ) : (
                <span>{t("followUpCard.none")}</span>
              )}
            </div>
            {canWrite && open ? (
              <LeadFollowUp leadId={lead.id} hasFollowUp={Boolean(lead.nextFollowUpAt)} />
            ) : null}
          </Section>

          <Section title={t("detail.asked")}>
            <Facts
              items={[
                [t("detail.kind"), t(`kinds.${lead.kind}`)],
                ...optional(t("detail.from"), travel.from),
                ...optional(t("detail.to"), travel.to),
                ...optional(t("detail.departOn"), travel.departOn && day(travel.departOn)),
                ...optional(t("detail.returnOn"), travel.returnOn && day(travel.returnOn)),
                ...optional(t("detail.startDate"), travel.startDate && day(travel.startDate)),
                ...optional(
                  t("detail.travellers"),
                  travel.adults
                    ? t("detail.travellersValue", { adults: travel.adults, children: travel.children })
                    : null,
                ),
                ...optional(t("detail.travelClass"), travel.travelClass),
                ...optional(
                  t("detail.package"),
                  lead.packageId ? (
                    <Link href={`/admin/packages/${lead.packageId}`} className="text-primary">
                      {lead.packageTitle ?? t("detail.openPackage")}
                    </Link>
                  ) : null,
                ),
                ...optional(t("detail.service"), lead.serviceSlug),
                ...optional(
                  t("detail.message"),
                  lead.message && <span className="font-normal whitespace-pre-line">{lead.message}</span>,
                ),
              ]}
            />
          </Section>

          <Section title={t("detail.contactTitle")}>
            <Facts
              items={[
                [
                  t("detail.phone"),
                  <a key="p" href={`tel:${lead.phone}`} className="text-primary">
                    {lead.phone}
                  </a>,
                ],
                [t("detail.email"), lead.email || "–"],
                [t("detail.language"), lead.locale === "hi" ? "हिन्दी" : "English"],
                [
                  t("detail.lastContacted"),
                  lead.lastContactedAt ? leadTime(format, lead.lastContactedAt) : t("detail.never"),
                ],
                ...optional(t("detail.account"), lead.userId ? t("detail.hasAccount") : null),
              ]}
            />
          </Section>

          <Section title={t("detail.sourceTitle")}>
            <Facts
              items={[
                [t("detail.source"), sourceLabel(t, lead.source)],
                ...utm.map(([k, v]) => [k, v] as [string, ReactNode]),
                ...optional(
                  t("detail.referrer"),
                  lead.referrer && <span className="font-normal break-all">{lead.referrer}</span>,
                ),
                ...optional(
                  t("detail.landingPage"),
                  lead.landingPath && <span className="font-mono text-xs break-all">{lead.landingPath}</span>,
                ),
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
