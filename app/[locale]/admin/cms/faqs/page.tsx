import { getLocale, getTranslations } from "next-intl/server";
import { CmsSubnav } from "@/components/admin/cms-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function CmsFaqsPage() {
  const session = await requirePermission("cms.read", "/admin/cms/faqs");
  const t = await getTranslations();
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: faqs }, { data: services }] = await Promise.all([
    supabase.from("faqs").select("id, service_id, question, sort_order, is_published").order("sort_order"),
    supabase.from("services").select("id, name"),
  ]);
  const serviceName = new Map((services ?? []).map((s) => [s.id, pickLocalized(s.name, locale)]));
  const rows = (faqs ?? []).map((f) => ({
    ...f,
    service: f.service_id ? (serviceName.get(f.service_id) ?? "") : t("cms.fields.general"),
  }));
  const canWrite = hasPermission(session.permissions, "cms.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.modules.cms")}
        lead={t("cms.lead")}
        newHref={canWrite ? "/admin/cms/faqs/new" : undefined}
        newLabel={t("cms.actions.new")}
      >
        <CmsSubnav active="faqs" />
      </AdminPageHeader>
      <DataTable
        rows={rows}
        editHref={canWrite ? "/admin/cms/faqs" : undefined}
        columns={[
          { key: "question", header: t("cms.fields.question"), kind: "localized" },
          { key: "service", header: t("cms.fields.service"), kind: "badge" },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_published", header: t("cms.fields.published"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
