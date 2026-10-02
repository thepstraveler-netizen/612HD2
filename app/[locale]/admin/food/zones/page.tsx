import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { FoodSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listDeliveryZones } from "@/lib/delivery/admin";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";

/** Delivery zones (shared by food, essentials and medicine): fee, free-delivery threshold and ETA. */
export default async function DeliveryZonesPage() {
  const session = await requirePermission("food.read", "/admin/food/zones");
  const canWrite = hasPermission(session.permissions, "food.write");
  const [t, locale, zones] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getLocale(),
    listDeliveryZones(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("zones.title")}
        lead={t("zones.lead")}
        newHref={canWrite ? "/admin/food/zones/new" : undefined}
        newLabel={t("zones.new")}
      >
        <FoodSubnav active="zones" />
      </AdminPageHeader>
      <DataTable
        rows={zones.map((z) => ({
          id: z.id,
          name: z.name,
          slug: z.slug,
          fee: formatPaise(z.fee_paise, locale),
          free: z.free_above_paise === null ? t("zones.neverFree") : formatPaise(z.free_above_paise, locale),
          eta: t("zones.minutes", { minutes: z.eta_minutes }),
          active: z.is_active,
          sort: z.sort_order,
        }))}
        editHref={canWrite ? "/admin/food/zones" : undefined}
        columns={[
          { key: "name", header: t("fields.name"), kind: "localized" },
          { key: "slug", header: t("fields.slug") },
          { key: "fee", header: t("zones.fee"), sortable: false },
          { key: "free", header: t("zones.freeAbove"), sortable: false },
          { key: "eta", header: t("zones.eta"), sortable: false },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
