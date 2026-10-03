import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RoleManager } from "@/components/admin/role-manager";
import { requirePermission } from "@/lib/auth/guards";
import { listRoleHolders, listRoleOptions } from "@/lib/roles/queries";

export default async function AdminRolesPage() {
  const session = await requirePermission("users.manage_roles", "/admin/settings/users");
  const t = await getTranslations("rolesAdmin");
  const [roles, holders] = await Promise.all([listRoleOptions(), listRoleHolders()]);
  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")} backHref="/admin/settings" backLabel={t("back")} />
      <RoleManager
        roles={roles}
        holders={holders}
        currentUserId={session.user.id}
        canGrantSuperAdmin={session.roles.includes("super_admin")}
      />
    </div>
  );
}
