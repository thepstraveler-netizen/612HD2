import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ADMIN_MODULE_DEFS, adminModuleHref } from "@/lib/admin/modules";
import { requirePermission } from "@/lib/auth/guards";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions/constants";
import { visibleModules } from "@/lib/permissions/check";

export default async function AdminDashboardPage() {
  const session = await requirePermission("dashboard.read", "/admin");
  const t = await getTranslations("admin");
  const allowed = new Set(visibleModules(session.permissions));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("modules.dashboard")}</h1>
        <p className="text-muted-foreground">{t("dashboardLead")}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("yourRoles")}</span>
          {session.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {ROLE_LABELS[role as RoleKey] ?? role}
            </Badge>
          ))}
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_MODULE_DEFS.filter((m) => m.key !== "dashboard" && allowed.has(m.key)).map(
          ({ key, icon: Icon, phase }) => (
            <li key={key}>
              <Link
                href={adminModuleHref(key)}
                className="block h-full rounded-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="h-full transition hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      {t(`modules.${key}`)}
                    </CardTitle>
                    <CardDescription>{t("comingInPhase", { phase })}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
