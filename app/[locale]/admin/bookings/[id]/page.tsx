import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { BookingActions } from "@/components/admin/booking-actions";
import { BookingStatusBadge, ToneBadge, stateTone } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminBooking } from "@/lib/bookings/admin";
import {
  availableBookingActions,
  readSnapshot,
  refundable,
  snapshotName,
  suggestedRefund,
} from "@/lib/bookings/admin-forms";
import { balanceDue } from "@/lib/bookings/state";
import { daysBetween } from "@/lib/dates";
import { razorpayConfig } from "@/lib/env.server";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/constants";

const gstSchema = z.object({ gstin: z.string(), company: z.string(), address: z.string().optional() });

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

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("bookings.read", `/admin/bookings/${id}`);
  const [detail, t, format, locale] = await Promise.all([
    getAdminBooking(id),
    getTranslations("bookingsAdmin"),
    getFormatter(),
    getLocale(),
  ]);
  if (!detail) notFound();
  const { booking: b, items, guests, payments, refunds, invoice, notifications } = detail;

  const can = (p: PermissionKey) => hasPermission(session.permissions, p);
  const snapshot = readSnapshot(b.snapshot);
  const money = (paise: number) => formatPaise(paise, locale);
  const day = (iso: string | null) =>
    iso ? format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "–";
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "–";
  const balance = balanceDue({ totalPaise: b.total_paise, paidPaise: b.paid_paise });
  const actions = availableBookingActions(b, can, { paymentLinks: razorpayConfig() !== null });
  const quote = suggestedRefund(b, new Date());
  const gst = gstSchema.safeParse(b.gst_details);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={b.code} backHref="/admin/bookings" backLabel={t("detail.backToList")}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <BookingStatusBadge status={b.status} label={t(`status.${b.status}`)} />
          <span>{t(`services.${b.service}`)}</span>
          <span aria-hidden="true">·</span>
          <span>{t("detail.created", { date: when(b.created_at) })}</span>
        </div>
        <BookingActions
          bookingId={b.id}
          actions={actions}
          refundablePaise={refundable(b)}
          balancePaise={balance}
          suggestion={{
            refundPaise: quote.refundPaise,
            percent: quote.percent,
            hoursBefore: quote.hoursBefore,
          }}
          canRefund={can("payments.refund")}
        />
      </AdminPageHeader>

      {b.status === "cancelled" || b.cancelled_at ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {t("detail.cancelledOn", { date: when(b.cancelled_at) })}
          {b.cancel_reason ? ` — ${b.cancel_reason}` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title={t("detail.stay")}>
            <Facts
              items={[
                [t("detail.hotel"), snapshotName(snapshot.hotel?.name, locale) || "–"],
                [t("detail.room"), snapshotName(snapshot.room?.name, locale) || "–"],
                [t("detail.plan"), snapshotName(snapshot.plan?.name, locale) || "–"],
                [
                  t("detail.checkIn"),
                  `${day(b.check_in)}${snapshot.hotel?.checkInTime ? ` · ${snapshot.hotel.checkInTime.slice(0, 5)}` : ""}`,
                ],
                [
                  t("detail.checkOut"),
                  `${day(b.check_out)}${snapshot.hotel?.checkOutTime ? ` · ${snapshot.hotel.checkOutTime.slice(0, 5)}` : ""}`,
                ],
                [
                  t("detail.nights"),
                  b.check_in && b.check_out ? String(daysBetween(b.check_in, b.check_out)) : "–",
                ],
                [t("detail.rooms"), String(b.rooms ?? "–")],
                [
                  t("detail.occupancy"),
                  t("detail.occupancyValue", { adults: b.adults ?? 0, children: b.children }),
                ],
                [
                  t("detail.refundPolicy"),
                  snapshot.plan?.isRefundable ? t("detail.refundable") : t("detail.nonRefundable"),
                ],
                ...(b.expires_at ? [[t("detail.holdUntil"), when(b.expires_at)] as [string, ReactNode]] : []),
              ]}
            />
          </Section>

          <Section title={t("detail.guests")}>
            <ul className="space-y-1 text-sm">
              {guests.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.full_name}</span>
                  {g.is_primary ? <ToneBadge tone="info" label={t("detail.primary")} /> : null}
                  {g.is_child ? <ToneBadge tone="muted" label={t("detail.child")} /> : null}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("detail.price")}>
            <AdminTable
              empty={t("detail.noLines")}
              headers={[
                t("detail.line"),
                t("detail.date"),
                t("detail.qty"),
                t("detail.amount"),
                t("detail.discount"),
                t("detail.gstRate"),
                t("detail.tax"),
                t("detail.lineTotal"),
              ]}
              rows={items.map((i) => ({
                key: i.id,
                cells: [
                  <span key="d" className="block min-w-40">
                    {i.description}
                    {i.sac ? <span className="block text-xs text-muted-foreground">SAC {i.sac}</span> : null}
                  </span>,
                  i.service_date ? day(i.service_date) : "–",
                  i.quantity,
                  money(i.amount_paise),
                  i.discount_paise ? `− ${money(i.discount_paise)}` : "–",
                  `${i.tax_rate_bps / 100}%`,
                  money(i.tax_paise),
                  <span key="t" className="font-medium whitespace-nowrap">
                    {money(i.amount_paise - i.discount_paise + i.tax_paise)}
                  </span>,
                ],
              }))}
            />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={t("detail.totals")}>
            <Facts
              items={[
                [t("detail.subtotal"), money(b.subtotal_paise)],
                [
                  t("detail.totalDiscount"),
                  b.discount_paise
                    ? `− ${money(b.discount_paise)}${b.coupon_code ? ` (${b.coupon_code})` : ""}`
                    : "–",
                ],
                [t("detail.totalTax"), money(b.tax_paise)],
                [t("detail.total"), <strong key="t">{money(b.total_paise)}</strong>],
                [t("detail.paymentMode"), t(`paymentModes.${b.payment_mode}`)],
                [t("detail.paid"), money(b.paid_paise)],
                [t("detail.refunded"), b.refunded_paise ? money(b.refunded_paise) : "–"],
                [
                  t("detail.balance"),
                  <span key="b" className={balance > 0 ? "text-accent-amber" : undefined}>
                    {money(balance)}
                  </span>,
                ],
              ]}
            />
          </Section>

          <Section title={t("detail.contact")}>
            <Facts
              items={[
                [t("detail.name"), b.contact_name],
                [
                  t("detail.phone"),
                  <a key="p" href={`tel:${b.contact_phone}`} className="text-primary">
                    {b.contact_phone}
                  </a>,
                ],
                [t("detail.email"), b.contact_email || "–"],
                [t("detail.language"), b.locale === "hi" ? "हिन्दी" : "English"],
                ...(b.special_requests
                  ? [[t("detail.specialRequests"), b.special_requests] as [string, ReactNode]]
                  : []),
                ...(gst.success
                  ? [
                      [
                        t("detail.gst"),
                        `${gst.data.gstin} · ${gst.data.company}${gst.data.address ? ` · ${gst.data.address}` : ""}`,
                      ] as [string, ReactNode],
                    ]
                  : []),
              ]}
            />
          </Section>

          <Section title={t("detail.invoice")}>
            {invoice ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-mono font-medium">{invoice.number}</span>
                  <span className="block text-muted-foreground">{when(invoice.issued_at)}</span>
                </span>
                <Button asChild variant="outline" size="sm">
                  {/* Route handler, not a localized page: a plain link with no locale prefix. */}
                  <a href={`/api/invoices/${b.code}`} target="_blank" rel="noopener">
                    <FileText /> {t("detail.downloadInvoice")}
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.noInvoice")}</p>
            )}
          </Section>
        </div>
      </div>

      {can("payments.read") ? (
        <>
          <Section title={t("detail.payments")}>
            <AdminTable
              wide={[4]}
              statusColumn={2}
              empty={t("detail.noPayments")}
              headers={[
                t("paymentColumns.provider"),
                t("paymentColumns.amount"),
                t("paymentColumns.status"),
                t("paymentColumns.method"),
                t("paymentColumns.reference"),
                t("paymentColumns.captured"),
              ]}
              rows={payments.map((p) => ({
                key: p.id,
                cells: [
                  t(`providers.${p.provider}`),
                  money(p.amount_paise),
                  <ToneBadge key="s" tone={stateTone(p.status)} label={t(`paymentStatus.${p.status}`)} />,
                  p.method ? (t.has(`methods.${p.method}`) ? t(`methods.${p.method}`) : p.method) : "–",
                  <span key="r" className="font-mono text-xs break-all">
                    {p.provider_payment_id ?? p.reference ?? p.payment_link_url ?? p.provider_order_id ?? "–"}
                  </span>,
                  when(p.captured_at),
                ],
              }))}
            />
          </Section>
          <Section title={t("detail.refunds")}>
            <AdminTable
              empty={t("detail.noRefunds")}
              headers={[
                t("refundColumns.amount"),
                t("refundColumns.status"),
                t("refundColumns.reason"),
                t("refundColumns.created"),
              ]}
              rows={refunds.map((r) => ({
                key: r.id,
                cells: [
                  money(r.amount_paise),
                  <ToneBadge key="s" tone={stateTone(r.status)} label={t(`refundStatus.${r.status}`)} />,
                  r.reason ?? "–",
                  when(r.created_at),
                ],
              }))}
            />
          </Section>
        </>
      ) : null}

      <Section title={t("detail.notifications")}>
        <AdminTable
          titleColumn={1}
          statusColumn={4}
          empty={t("detail.noNotifications")}
          headers={[
            t("logColumns.when"),
            t("logColumns.template"),
            t("logColumns.channel"),
            t("logColumns.recipient"),
            t("logColumns.status"),
          ]}
          rows={notifications.map((n) => ({
            key: n.id,
            cells: [
              when(n.created_at),
              <span key="k" className="font-mono text-xs">
                {n.template_key}
              </span>,
              t(`channels.${n.channel}`),
              n.recipient ?? "–",
              <span key="s" className="space-y-1">
                <ToneBadge tone={stateTone(n.status)} label={t(`logStatus.${n.status}`)} />
                {n.error ? <span className="block text-xs text-muted-foreground">{n.error}</span> : null}
              </span>,
            ],
          }))}
        />
      </Section>
    </div>
  );
}
