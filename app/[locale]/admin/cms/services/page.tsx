import { getTranslations } from "next-intl/server";
import { CmsSubnav } from "@/components/admin/cms-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function CmsServicesPage() {
  const session = await requirePermission("cms.read", "/admin/cms/services");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, slug, kind, sort_order, is_published, show_in_nav")
    .is("deleted_at", null)
    .order("sort_order");
  const canWrite = hasPermission(session.permissions, "cms.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.modules.cms")}
        lead={t("cms.lead")}
        newHref={canWrite ? "/admin/cms/services/new" : undefined}
        newLabel={t("cms.actions.new")}
      >
        <CmsSubnav active="services" />
      </AdminPageHeader>
      <DataTable
        rows={data ?? []}
        editHref={canWrite ? "/admin/cms/services" : undefined}
        columns={[
          { key: "name", header: t("cms.fields.name"), kind: "localized" },
          { key: "slug", header: t("cms.fields.slug") },
          { key: "kind", header: t("cms.fields.kind"), kind: "badge" },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_published", header: t("cms.fields.published"), kind: "boolean" },
          { key: "show_in_nav", header: t("cms.fields.showInNav"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
