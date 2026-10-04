import { getFormatter, getTranslations } from "next-intl/server";
import { ToneBadge, stateTone } from "@/components/admin/booking-status";
import { NotificationSubnav } from "@/components/admin/notification-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listNotificationLogs } from "@/lib/bookings/admin";

/** The latest 200 sends (or skips) on every channel. */
export default async function AdminNotificationLogsPage() {
  await requirePermission("notifications.read", "/admin/notifications/logs");
  const [t, format, logs] = await Promise.all([
    getTranslations("bookingsAdmin"),
    getFormatter(),
    listNotificationLogs(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("notifications.title")} lead={t("notifications.logsLead")}>
        <NotificationSubnav active="logs" />
      </AdminPageHeader>
      <AdminTable
        titleColumn={1}
        statusColumn={5}
        wide={[6]}
        empty={t("notifications.logsEmpty")}
        headers={[
          t("logColumns.when"),
          t("logColumns.template"),
          t("logColumns.channel"),
          t("logColumns.recipient"),
          t("logColumns.booking"),
          t("logColumns.status"),
          t("logColumns.error"),
        ]}
        rows={logs.map((l) => ({
          key: l.id,
          cells: [
            <span key="w" className="whitespace-nowrap">
              {format.dateTime(new Date(l.created_at), { dateStyle: "medium", timeStyle: "short" })}
            </span>,
            <span key="k" className="font-mono text-xs">
              {l.template_key}
            </span>,
            t(`channels.${l.channel}`),
            <span key="r" className="break-all">
              {l.recipient ?? "–"}
            </span>,
            l.booking_code && l.booking_id ? (
              <Link
                key="b"
                href={`/admin/bookings/${l.booking_id}`}
                className="font-mono font-medium text-primary"
              >
                {l.booking_code}
              </Link>
            ) : (
              "–"
            ),
            <ToneBadge key="s" tone={stateTone(l.status)} label={t(`logStatus.${l.status}`)} />,
            <span key="e" className="block max-w-xs text-xs text-muted-foreground">
              {l.error ?? "–"}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
