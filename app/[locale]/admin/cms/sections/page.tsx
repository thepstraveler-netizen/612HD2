import { getTranslations } from "next-intl/server";
import { CmsSubnav } from "@/components/admin/cms-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function CmsSectionsPage() {
  const session = await requirePermission("cms.read", "/admin/cms/sections");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_sections")
    .select("id, page, type, title, sort_order, is_visible")
    .order("page")
    .order("sort_order");
  const canWrite = hasPermission(session.permissions, "cms.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("admin.modules.cms")} lead={t("cms.lead")}>
        <CmsSubnav active="sections" />
      </AdminPageHeader>
      <DataTable
        rows={data ?? []}
        editHref={canWrite ? "/admin/cms/sections" : undefined}
        columns={[
          { key: "type", header: t("cms.fields.type"), kind: "badge" },
          { key: "title", header: t("cms.fields.title"), kind: "localized" },
          { key: "page", header: t("cms.fields.page") },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_visible", header: t("cms.fields.visible"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
