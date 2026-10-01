import { Construction } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { ADMIN_MODULE_DEFS } from "@/lib/admin/modules";
import { requirePermission } from "@/lib/auth/guards";
import { isAdminModule } from "@/lib/permissions/check";

/**
 * Generic, permission-guarded module shell. Each phase replaces a module's
 * placeholder with its own route segment (e.g. app/[locale]/admin/hotels),
 * which takes precedence over this dynamic route.
 */
export default async function AdminModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!isAdminModule(module) || module === "dashboard") notFound();
  await requirePermission(`${module}.read`, `/admin/${module}`);
  const t = await getTranslations("admin");
  const def = ADMIN_MODULE_DEFS.find((m) => m.key === module)!;

  return (
    <div className="space-y-6">
      <h1 className="text-[length:var(--text-title)] font-bold">{t(`modules.${module}`)}</h1>
      <EmptyState
        icon={Construction}
        title={t(`modules.${module}`)}
        description={t("comingInPhase", { phase: def.phase })}
      />
    </div>
  );
}
