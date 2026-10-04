import { getFormatter, getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listPaymentEvents } from "@/lib/bookings/admin";

/** Razorpay webhook deliveries as received, with what the handler did with each. */
export default async function AdminPaymentEventsPage() {
  await requirePermission("payments.read", "/admin/payments/events");
  const [t, format, events] = await Promise.all([
    getTranslations("bookingsAdmin"),
    getFormatter(),
    listPaymentEvents(),
  ]);
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "medium" }) : "–";

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("payments.title")} lead={t("payments.eventsLead")}>
        <PaymentSubnav active="events" />
      </AdminPageHeader>
      <AdminTable
        titleColumn={1}
        wide={[4]}
        empty={t("payments.eventsEmpty")}
        headers={[
          t("events.received"),
          t("events.type"),
          t("events.booking"),
          t("events.result"),
          t("events.payload"),
        ]}
        rows={events.map((e) => ({
          key: e.id,
          cells: [
            <span key="w" className="whitespace-nowrap">
              {when(e.received_at)}
            </span>,
            <span key="t" className="font-mono text-xs">
              {e.event_type}
            </span>,
            e.booking_code && e.booking_id ? (
              <Link
                key="b"
                href={`/admin/bookings/${e.booking_id}`}
                className="font-mono font-medium text-primary"
              >
                {e.booking_code}
              </Link>
            ) : (
              "–"
            ),
            <span key="r" className="space-y-1">
              {e.error ? (
                <ToneBadge tone="danger" label={t("events.failed")} />
              ) : e.processed_at ? (
                <ToneBadge tone="success" label={e.result ?? t("events.processed")} />
              ) : (
                <ToneBadge tone="warning" label={t("events.notProcessed")} />
              )}
              {e.error ? <span className="block max-w-xs text-xs text-destructive">{e.error}</span> : null}
            </span>,
            <details key="p" className="max-w-[min(32rem,70vw)]">
              <summary className="min-h-10 cursor-pointer py-2 text-primary">
                {t("events.showPayload")}
              </summary>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </details>,
          ],
        }))}
      />
    </div>
  );
}
