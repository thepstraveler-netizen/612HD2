import { getTranslations } from "next-intl/server";
import { CmsSubnav } from "@/components/admin/cms-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function CmsNavigationPage() {
  const session = await requirePermission("cms.read", "/admin/cms/navigation");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("navigation_links")
    .select("id, menu, label, href, sort_order, is_visible")
    .order("menu")
    .order("sort_order");
  const canWrite = hasPermission(session.permissions, "cms.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.modules.cms")}
        lead={t("cms.lead")}
        newHref={canWrite ? "/admin/cms/navigation/new" : undefined}
        newLabel={t("cms.actions.new")}
      >
        <CmsSubnav active="navigation" />
      </AdminPageHeader>
      <DataTable
        rows={data ?? []}
        editHref={canWrite ? "/admin/cms/navigation" : undefined}
        columns={[
          { key: "menu", header: t("cms.fields.menu"), kind: "badge" },
          { key: "label", header: t("cms.fields.label"), kind: "localized" },
          { key: "href", header: t("cms.fields.href") },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_visible", header: t("cms.fields.visible"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
