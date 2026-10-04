import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { BookingStatusBadge, ToneBadge } from "@/components/admin/booking-status";
import {
  AdjustPointsForm,
  BlockButton,
  DeleteNoteButton,
  NoteForm,
} from "@/components/admin/customer-actions";
import { InsightCard, KpiCard } from "@/components/admin/insights-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getCustomer } from "@/lib/customers/queries";
import { listCustomerPrivacyRequests } from "@/lib/privacy/queries";
import { formatPaise } from "@/lib/money";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions/constants";
import { hasPermission } from "@/lib/permissions/check";

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Admin → Customers → one customer: profile, bookings, points, referrals, reviews, staff notes. */
export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("customers.read", `/admin/customers/${id}`);
  const [customer, privacyRequests] = await Promise.all([getCustomer(id), listCustomerPrivacyRequests(id)]);
  if (!customer) notFound();
  const [t, tBookings, tPrivacy, locale, format] = await Promise.all([
    getTranslations("customersAdmin"),
    getTranslations("bookingsAdmin"),
    getTranslations("privacyAdmin"),
    getLocale(),
    getFormatter(),
  ]);
  const canWrite = hasPermission(session.permissions, "customers.write");
  const canBookings = hasPermission(session.permissions, "bookings.read");
  const { profile, summary } = customer;
  const money = (paise: number) => formatPaise(paise, locale);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const dateTime = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const name = (uid: string | null) => (uid ? (customer.names.get(uid) ?? uid.slice(0, 8)) : t("system"));
  const right = (v: ReactNode) => (
    <span className="block text-right whitespace-nowrap tabular-nums">{v}</span>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={profile.full_name || profile.email || t("noName")}
        backHref="/admin/customers"
        backLabel={t("back")}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          title={t("profile.title")}
          action={canWrite ? <BlockButton userId={profile.id} blocked={profile.is_blocked} /> : null}
        >
          <Facts
            items={[
              [t("profile.email"), profile.email ?? "—"],
              [t("profile.phone"), profile.phone ?? "—"],
              [t("profile.joined"), date(profile.created_at)],
              [t("profile.language"), profile.preferred_locale === "hi" ? "हिन्दी" : "English"],
              [
                t("profile.referralCode"),
                profile.referral_code ? <code key="c">{profile.referral_code}</code> : "—",
              ],
              [
                t("profile.status"),
                profile.is_blocked ? (
                  <ToneBadge key="s" tone="danger" label={t("status.blocked")} />
                ) : (
                  <ToneBadge key="s" tone="success" label={t("status.active")} />
                ),
              ],
              [
                t("profile.roles"),
                <span key="r" className="flex flex-wrap gap-1">
                  {customer.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {ROLE_LABELS[role as RoleKey] ?? role}
                    </Badge>
                  ))}
                </span>,
              ],
            ]}
          />
          {profile.is_blocked ? <p className="text-xs text-muted-foreground">{t("block.explain")}</p> : null}
        </InsightCard>
        <ul className="grid grid-cols-2 gap-3 lg:col-span-2">
          <li>
            <KpiCard
              label={t("summary.bookings")}
              value={summary.bookings}
              hint={t("summary.bookingsHint")}
            />
          </li>
          <li>
            <KpiCard
              label={t("summary.spend")}
              value={money(summary.spend_paise)}
              hint={t("summary.spendHint")}
            />
          </li>
          <li>
            <KpiCard label={t("summary.completed")} value={summary.completed} />
          </li>
          <li>
            <KpiCard label={t("summary.points")} value={summary.points} />
          </li>
        </ul>
      </div>

      <InsightCard title={t("bookings.title")}>
        <AdminTable
          statusColumn={2}
          empty={t("bookings.empty")}
          headers={[
            t("bookings.code"),
            t("bookings.service"),
            t("bookings.status"),
            <span key="t" className="block text-right">
              {t("bookings.total")}
            </span>,
            <span key="p" className="block text-right">
              {t("bookings.paid")}
            </span>,
            t("bookings.date"),
          ]}
          rows={customer.bookings.map((b) => ({
            key: b.id,
            cells: [
              canBookings ? (
                <Link key="c" href={`/admin/bookings/${b.id}`} className="font-mono text-primary">
                  {b.code}
                </Link>
              ) : (
                <span key="c" className="font-mono">
                  {b.code}
                </span>
              ),
              tBookings.has(`services.${b.service}`) ? tBookings(`services.${b.service}`) : b.service,
              <BookingStatusBadge key="s" status={b.status} label={tBookings(`status.${b.status}`)} />,
              right(money(b.total_paise)),
              right(money(b.paid_paise - b.refunded_paise)),
              <span key="d" className="whitespace-nowrap">
                {date(b.created_at)}
              </span>,
            ],
          }))}
        />
      </InsightCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard title={t("points.title")}>
          <p className="text-sm">
            {t("points.balance")} <span className="text-lg font-bold tabular-nums">{summary.points}</span>
          </p>
          {canWrite ? <AdjustPointsForm userId={profile.id} /> : null}
          {customer.ledger.length ? (
            <ul className="grid gap-2 text-sm">
              {customer.ledger.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 border-t pt-2">
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {t.has(`ledgerKinds.${l.kind}`) ? t(`ledgerKinds.${l.kind}`) : l.kind}
                    </span>
                    {l.note ? (
                      <span className="block break-words text-muted-foreground">{l.note}</span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {dateTime(l.created_at)}
                      {l.created_by ? ` · ${name(l.created_by)}` : ""}
                    </span>
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${l.points > 0 ? "text-accent-green" : "text-destructive"}`}
                  >
                    {l.points > 0 ? `+${l.points}` : l.points}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("points.empty")}</p>
          )}
        </InsightCard>

        <div className="grid content-start gap-4">
          <InsightCard title={t("notes.title")}>
            {canWrite ? <NoteForm userId={profile.id} /> : null}
            {customer.notes.length ? (
              <ul className="grid gap-2 text-sm">
                {customer.notes.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-2 border-t pt-2">
                    <span className="min-w-0">
                      <span className="block break-words whitespace-pre-line">{n.body}</span>
                      <span className="block text-xs text-muted-foreground">
                        {name(n.created_by)} · {dateTime(n.created_at)}
                      </span>
                    </span>
                    {canWrite ? <DeleteNoteButton id={n.id} userId={profile.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notes.empty")}</p>
            )}
          </InsightCard>

          <InsightCard title={t("referrals.title")}>
            {customer.referrals.length ? (
              <ul className="grid gap-2 text-sm">
                {customer.referrals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-t pt-2">
                    <span className="min-w-0">
                      <span className="block">
                        {t(`referrals.${r.role}`)}{" "}
                        <Link href={`/admin/customers/${r.otherId}`} className="text-primary">
                          {name(r.otherId)}
                        </Link>
                      </span>
                      <span className="block text-xs text-muted-foreground">{date(r.created_at)}</span>
                    </span>
                    <ToneBadge
                      tone={
                        r.status === "rewarded" ? "success" : r.status === "pending" ? "warning" : "muted"
                      }
                      label={t(`referrals.status.${r.status}`)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("referrals.empty")}</p>
            )}
          </InsightCard>

          <InsightCard
            title={tPrivacy("customerTitle")}
            action={
              <Link href="/admin/customers/privacy" className="text-sm text-primary">
                {tPrivacy("openList")}
              </Link>
            }
          >
            {privacyRequests.length ? (
              <ul className="grid gap-2 text-sm">
                {privacyRequests.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 border-t pt-2">
                    <span className="min-w-0">
                      <span className="block font-medium">{tPrivacy(`kind.${r.kind}`)}</span>
                      {r.reason ? (
                        <span className="block break-words text-muted-foreground">{r.reason}</span>
                      ) : null}
                      {r.note ? (
                        <span className="block break-words text-muted-foreground">
                          {tPrivacy("staffNote")} {r.note}
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
                    </span>
                    <ToneBadge
                      tone={
                        r.status === "pending"
                          ? "warning"
                          : r.status === "completed"
                            ? "success"
                            : r.status === "rejected"
                              ? "danger"
                              : "muted"
                      }
                      label={tPrivacy(`status.${r.status}`)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tPrivacy("customerEmpty")}</p>
            )}
          </InsightCard>

          <InsightCard title={t("reviews.title")}>
            {customer.reviews.length ? (
              <ul className="grid gap-2 text-sm">
                {customer.reviews.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-t pt-2">
                    <span className="min-w-0">
                      <span className="block">
                        {"★".repeat(r.rating)}
                        <span className="sr-only">{t("reviews.rating", { rating: r.rating })}</span>{" "}
                        {r.title ?? ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {tBookings.has(`services.${r.service}`)
                          ? tBookings(`services.${r.service}`)
                          : r.service}{" "}
                        · {date(r.created_at)}
                      </span>
                    </span>
                    <ToneBadge
                      tone={
                        r.status === "published" ? "success" : r.status === "pending" ? "warning" : "muted"
                      }
                      label={t(`reviews.status.${r.status}`)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("reviews.empty")}</p>
            )}
          </InsightCard>
        </div>
      </div>
    </div>
  );
}
