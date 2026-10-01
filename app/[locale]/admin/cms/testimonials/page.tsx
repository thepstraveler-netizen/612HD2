import { getTranslations } from "next-intl/server";
import { CmsSubnav } from "@/components/admin/cms-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function CmsTestimonialsPage() {
  const session = await requirePermission("cms.read", "/admin/cms/testimonials");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("testimonials")
    .select("id, author_name, author_place, quote, rating, sort_order, is_published")
    .order("sort_order");
  const canWrite = hasPermission(session.permissions, "cms.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.modules.cms")}
        lead={t("cms.lead")}
        newHref={canWrite ? "/admin/cms/testimonials/new" : undefined}
        newLabel={t("cms.actions.new")}
      >
        <CmsSubnav active="testimonials" />
      </AdminPageHeader>
      <DataTable
        rows={data ?? []}
        editHref={canWrite ? "/admin/cms/testimonials" : undefined}
        columns={[
          { key: "author_name", header: t("cms.fields.author") },
          { key: "author_place", header: t("cms.fields.place") },
          { key: "quote", header: t("cms.fields.quote"), kind: "localized", sortable: false },
          { key: "rating", header: t("cms.fields.rating"), kind: "number" },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_published", header: t("cms.fields.published"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
