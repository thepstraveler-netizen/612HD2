import { getFormatter, getTranslations } from "next-intl/server";
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
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">{t("auditWhen")}</th>
                <th className="px-4 py-3">{t("auditActor")}</th>
                <th className="px-4 py-3">{t("auditAction")}</th>
                <th className="px-4 py-3">{t("auditTable")}</th>
                <th className="px-4 py-3">{t("auditRecord")}</th>
                <th className="px-4 py-3">{t("auditFields")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {format.dateTime(new Date(row.occurred_at), { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.actor_id?.slice(0, 8) ?? row.actor_role}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_VARIANT[row.action]}>{row.action}</Badge>
                  </td>
                  <td className="px-4 py-3">{row.table_name}</td>
                  <td className="max-w-[12rem] truncate px-4 py-3 font-mono text-xs">{row.record_id}</td>
                  <td className="px-4 py-3 text-xs">{row.changed_fields?.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
