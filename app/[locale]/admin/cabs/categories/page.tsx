import { getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listCategories, listModels } from "@/lib/cabs/admin";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabCategoriesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/categories");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, categories, models] = await Promise.all([
    getTranslations("cabsAdmin"),
    listCategories(),
    listModels(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("categories.title")}
        lead={t("categories.lead")}
        newHref={canWrite ? "/admin/cabs/categories/new" : undefined}
        newLabel={t("categories.new")}
      >
        <CabSubnav active="categories" />
      </AdminPageHeader>
      <DataTable
        rows={categories.map((c) => ({
          id: c.id,
          name: c.name,
          key: c.key,
          body: t(`categories.bodyTypes.${c.body_type}`),
          seats: c.seats,
          luggage: c.luggage,
          models: models
            .filter((m) => m.category_id === c.id)
            .map((m) => (m.is_featured ? `${m.name} ★` : m.name))
            .join(", "),
          ac: c.is_ac,
          active: c.is_active,
          sort: c.sort_order,
        }))}
        editHref={canWrite ? "/admin/cabs/categories" : undefined}
        columns={[
          { key: "name", header: t("columns.name"), kind: "localized" },
          { key: "key", header: t("fields.key") },
          { key: "body", header: t("categories.bodyType") },
          { key: "seats", header: t("categories.seats"), kind: "number" },
          { key: "luggage", header: t("categories.luggage"), kind: "number" },
          { key: "models", header: t("categories.sections.models"), sortable: false },
          { key: "ac", header: t("categories.ac"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
