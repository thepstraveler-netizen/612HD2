import { getFormatter, getTranslations } from "next-intl/server";
import { AdminTable } from "@/components/admin/payment-table";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const ACTION_VARIANT = { INSERT: "secondary", UPDATE: "outline", DELETE: "destructive" } as const;

/**
 * Latest audit entries. A paginated TanStack Table with filters replaces
 * this simple list when the admin DataTable lands (phase 2).
 */
export default async function AuditLogPage() {
  await requirePermission("audit.read", "/admin/audit");
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_id, actor_role, action, table_name, record_id, changed_fields")
    .order("occurred_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("audit")}</h1>
        <p className="text-muted-foreground">{t("auditLead")}</p>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="text-muted-foreground">{t("auditEmpty")}</p>
      ) : (
        <AdminTable
          titleColumn={3}
          statusColumn={2}
          wide={[4, 5]}
          empty={t("auditEmpty")}
          headers={[
            t("auditWhen"),
            t("auditActor"),
            t("auditAction"),
            t("auditTable"),
            t("auditRecord"),
            t("auditFields"),
          ]}
          rows={rows.map((row) => ({
            key: String(row.id),
            cells: [
              <span key="w" className="whitespace-nowrap">
                {format.dateTime(new Date(row.occurred_at), { dateStyle: "medium", timeStyle: "short" })}
              </span>,
              <span key="a" className="font-mono text-xs">
                {row.actor_id?.slice(0, 8) ?? row.actor_role}
              </span>,
              <Badge key="x" variant={ACTION_VARIANT[row.action]}>
                {row.action}
              </Badge>,
              row.table_name,
              <span key="r" className="block font-mono text-xs break-all md:max-w-[12rem] md:truncate">
                {row.record_id}
              </span>,
              row.changed_fields?.length ? (
                <span key="f" className="text-xs">
                  {row.changed_fields.join(", ")}
                </span>
              ) : null,
            ],
          }))}
        />
      )}
    </div>
  );
}
