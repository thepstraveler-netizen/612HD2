import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { FoodSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminStores } from "@/lib/delivery/admin";
import { hasPermission } from "@/lib/permissions/check";
import { FOOD_KINDS } from "@/schemas/delivery-admin";

export default async function FoodStoresPage() {
  const session = await requirePermission("food.read", "/admin/food/stores");
  const canWrite = hasPermission(session.permissions, "food.write");
  const [t, stores] = await Promise.all([getTranslations("deliveryAdmin"), listAdminStores(FOOD_KINDS)]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("stores.title")}
        lead={t("stores.lead")}
        newHref={canWrite ? "/admin/food/stores/new" : undefined}
        newLabel={t("stores.new")}
      >
        <FoodSubnav active="stores" />
      </AdminPageHeader>
      <DataTable
        rows={stores.map((s) => ({
          id: s.id,
          name: s.name,
          kind: t(`kinds.${s.kind}`),
          vendor: s.vendorName,
          zones: s.zoneCount,
          hours: s.is_24x7 ? t("stores.open24x7") : t("stores.scheduled"),
          accepting: s.accepting_orders,
          featured: s.is_featured,
          active: s.is_active,
          sort: s.sort_order,
        }))}
        editHref={canWrite ? "/admin/food/stores" : undefined}
        columns={[
          { key: "name", header: t("fields.name"), kind: "localized" },
          { key: "kind", header: t("stores.kind"), kind: "badge" },
          { key: "vendor", header: t("stores.vendor") },
          { key: "zones", header: t("stores.zones"), kind: "number" },
          { key: "hours", header: t("stores.sections.hours") },
          { key: "accepting", header: t("stores.acceptingShort"), kind: "boolean" },
          { key: "featured", header: t("fields.featured"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
