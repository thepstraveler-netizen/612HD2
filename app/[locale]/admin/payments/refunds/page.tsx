import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ToneBadge, stateTone } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminRefunds } from "@/lib/bookings/admin";
import { formatPaise } from "@/lib/money";

export default async function AdminRefundsPage() {
  await requirePermission("payments.read", "/admin/payments/refunds");
  const [t, format, locale, refunds] = await Promise.all([
    getTranslations("bookingsAdmin"),
    getFormatter(),
    getLocale(),
    listAdminRefunds(),
  ]);
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "–";

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("payments.title")} lead={t("payments.refundsLead")}>
        <PaymentSubnav active="refunds" />
      </AdminPageHeader>
      <AdminTable
        empty={t("payments.refundsEmpty")}
        headers={[
          t("refundColumns.created"),
          t("refundColumns.booking"),
          t("refundColumns.amount"),
          t("refundColumns.status"),
          t("refundColumns.reason"),
          t("refundColumns.provider"),
          t("refundColumns.processed"),
        ]}
        rows={refunds.map((r) => ({
          key: r.id,
          cells: [
            <span key="c" className="whitespace-nowrap">
              {when(r.created_at)}
            </span>,
            r.booking_code ? (
              <Link
                key="b"
                href={`/admin/bookings/${r.booking_id}`}
                className="font-mono font-medium text-primary"
              >
                {r.booking_code}
              </Link>
            ) : (
              "–"
            ),
            <span key="a" className="whitespace-nowrap">
              {formatPaise(r.amount_paise, locale)}
            </span>,
            <ToneBadge key="s" tone={stateTone(r.status)} label={t(`refundStatus.${r.status}`)} />,
            <span key="r" className="block max-w-xs">
              {r.reason ?? "–"}
            </span>,
            <span key="p" className="font-mono text-xs">
              {r.provider_refund_id ?? t("providers.offline")}
            </span>,
            <span key="w" className="whitespace-nowrap">
              {when(r.processed_at)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
