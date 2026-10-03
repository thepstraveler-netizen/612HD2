import { getFormatter, getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { PrivacyRequestActions } from "@/components/privacy/privacy-request-actions";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { listPendingDeletionRequests } from "@/lib/privacy/queries";

/** Admin → Customers → Privacy requests: open account-deletion requests, oldest first. */
export default async function AdminPrivacyRequestsPage() {
  const session = await requirePermission("customers.read", "/admin/customers/privacy");
  const [t, format, rows] = await Promise.all([
    getTranslations("privacyAdmin"),
    getFormatter(),
    listPendingDeletionRequests(),
  ]);
  const canWrite = hasPermission(session.permissions, "customers.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("title")}
        lead={t("lead")}
        backHref="/admin/customers"
        backLabel={t("back")}
      />
      <AdminTable
        empty={t("empty")}
        headers={[
          t("columns.customer"),
          t("columns.requested"),
          t("columns.reason"),
          t("columns.openBookings"),
          ...(canWrite
            ? [
                <span key="a" className="sr-only">
                  {t("columns.actions")}
                </span>,
              ]
            : []),
        ]}
        rows={rows.map((r) => {
          const who = r.name || r.email || t("deletedAccount");
          return {
            key: r.id,
            cells: [
              r.user_id ? (
                <Link key="c" href={`/admin/customers/${r.user_id}`} className="block min-w-40 text-primary">
                  {who}
                  <span className="block text-xs break-all text-muted-foreground">{r.email}</span>
                </Link>
              ) : (
                <span key="c" className="block min-w-40">
                  {who}
                </span>
              ),
              <span key="d" className="whitespace-nowrap">
                {format.dateTime(new Date(r.created_at), { dateStyle: "medium" })}
              </span>,
              <span key="r" className="block max-w-72 text-sm break-words">
                {r.reason ?? "—"}
              </span>,
              r.blockers > 0 ? (
                <ToneBadge key="b" tone="warning" label={t("blockers", { count: r.blockers })} />
              ) : (
                <ToneBadge key="b" tone="success" label={t("noBlockers")} />
              ),
              ...(canWrite
                ? [<PrivacyRequestActions key="a" id={r.id} who={who} blockers={r.blockers} />]
                : []),
            ],
          };
        })}
      />
      <p className="max-w-3xl text-sm text-muted-foreground">{t("explain")}</p>
    </div>
  );
}
