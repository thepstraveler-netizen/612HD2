import { Pencil, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { NotificationSubnav } from "@/components/admin/notification-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listNotificationTemplates } from "@/lib/bookings/admin";
import { hasPermission } from "@/lib/permissions/check";
import type { Tables } from "@/types/database";

/** Templates grouped by event key; each key has one template per channel and language. */
export default async function AdminNotificationsPage() {
  const session = await requirePermission("notifications.read", "/admin/notifications");
  const [t, templates] = await Promise.all([
    getTranslations("bookingsAdmin.notifications"),
    listNotificationTemplates(),
  ]);
  const tc = await getTranslations("bookingsAdmin");
  const canWrite = hasPermission(session.permissions, "notifications.write");
  const groups = new Map<string, Tables<"notification_templates">[]>();
  for (const row of templates) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("title")}
        lead={t("lead")}
        newHref={canWrite ? "/admin/notifications/new" : undefined}
        newLabel={t("new")}
      >
        <NotificationSubnav active="templates" />
      </AdminPageHeader>
      {groups.size === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {[...groups].map(([key, rows]) => (
          <section key={key} className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold">{key}</h2>
              {canWrite ? (
                <Button asChild variant="ghost" size="sm" className="h-9">
                  <Link href={`/admin/notifications/new?key=${encodeURIComponent(key)}`}>
                    <Plus /> {t("addVariant")}
                  </Link>
                </Button>
              ) : null}
            </div>
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ToneBadge tone="info" label={tc(`channels.${row.channel}`)} />
                      <ToneBadge tone="muted" label={t(`locales.${row.locale}`)} />
                      {row.is_active ? null : <ToneBadge tone="warning" label={t("inactive")} />}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{row.subject ?? row.body}</p>
                  </div>
                  {canWrite ? (
                    <Button asChild variant="ghost" size="sm" className="h-9 shrink-0">
                      <Link href={`/admin/notifications/${row.id}`}>
                        <Pencil /> {t("edit")}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
