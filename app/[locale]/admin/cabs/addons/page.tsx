import { getLocale, getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listAddons, listCategories } from "@/lib/cabs/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabAddonsPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/addons");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, locale, addons, categories] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listAddons(),
    listCategories(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, pickLocalized(c.name, locale)]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("addons.title")}
        lead={t("addons.lead")}
        newHref={canWrite ? "/admin/cabs/addons/new" : undefined}
        newLabel={t("addons.new")}
      >
        <CabSubnav active="addons" />
      </AdminPageHeader>
      <DataTable
        rows={addons.map((a) => ({
          id: a.id,
          name: a.name,
          key: a.key,
          price: formatPaise(a.price_paise, locale),
          tripTypes: a.trip_types.length
            ? a.trip_types.map((v) => t(`tripTypes.${v}`)).join(", ")
            : t("fields.allTripTypes"),
          categories: a.category_ids.length
            ? a.category_ids.map((id) => categoryName.get(id) ?? "?").join(", ")
            : t("fields.allCategories"),
          active: a.is_active,
        }))}
        editHref={canWrite ? "/admin/cabs/addons" : undefined}
        columns={[
          { key: "name", header: t("columns.name"), kind: "localized" },
          { key: "key", header: t("fields.key") },
          { key: "price", header: t("addons.price"), sortable: false },
          { key: "tripTypes", header: t("fields.tripTypes"), sortable: false },
          { key: "categories", header: t("fields.categories"), sortable: false },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
