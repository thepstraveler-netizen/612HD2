import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ToneBadge, stateTone } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminPayments } from "@/lib/bookings/admin";
import { formatPaise } from "@/lib/money";

export default async function AdminPaymentsPage() {
  await requirePermission("payments.read", "/admin/payments");
  const [t, format, locale, payments] = await Promise.all([
    getTranslations("bookingsAdmin"),
    getFormatter(),
    getLocale(),
    listAdminPayments(),
  ]);
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "–";

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("payments.title")} lead={t("payments.lead")}>
        <PaymentSubnav active="payments" />
      </AdminPageHeader>
      <AdminTable
        empty={t("payments.empty")}
        headers={[
          t("paymentColumns.created"),
          t("paymentColumns.booking"),
          t("paymentColumns.provider"),
          t("paymentColumns.amount"),
          t("paymentColumns.status"),
          t("paymentColumns.method"),
          t("paymentColumns.captured"),
        ]}
        rows={payments.map((p) => ({
          key: p.id,
          cells: [
            <span key="c" className="whitespace-nowrap">
              {when(p.created_at)}
            </span>,
            p.booking_code ? (
              <Link
                key="b"
                href={`/admin/bookings/${p.booking_id}`}
                className="font-mono font-medium text-primary"
              >
                {p.booking_code}
              </Link>
            ) : (
              "–"
            ),
            <span key="p">
              {t(`providers.${p.provider}`)}
              {p.payment_link_id ? (
                <span className="block text-xs text-muted-foreground">{t("payments.viaLink")}</span>
              ) : null}
            </span>,
            <span key="a" className="whitespace-nowrap">
              {formatPaise(p.amount_paise, locale)}
            </span>,
            <span key="s" className="space-y-1">
              <ToneBadge tone={stateTone(p.status)} label={t(`paymentStatus.${p.status}`)} />
              {p.error_description ? (
                <span className="block text-xs text-destructive">{p.error_description}</span>
              ) : null}
            </span>,
            p.method ? (t.has(`methods.${p.method}`) ? t(`methods.${p.method}`) : p.method) : "–",
            <span key="w" className="whitespace-nowrap">
              {when(p.captured_at)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
