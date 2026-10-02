import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { FoodSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listRiders, vendorInfo } from "@/lib/delivery/admin";
import { hasPermission } from "@/lib/permissions/check";

/** Delivery riders: platform riders serve every store, a store's own riders only that vendor's orders. */
export default async function RidersPage() {
  const session = await requirePermission("food.read", "/admin/food/riders");
  const canWrite = hasPermission(session.permissions, "food.write");
  const [t, riders] = await Promise.all([getTranslations("deliveryAdmin"), listRiders()]);
  const vendors = await vendorInfo(riders.flatMap((r) => (r.vendor_id ? [r.vendor_id] : [])));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("riders.title")}
        lead={t("riders.lead")}
        newHref={canWrite ? "/admin/food/riders/new" : undefined}
        newLabel={t("riders.new")}
      >
        <FoodSubnav active="riders" />
      </AdminPageHeader>
      <DataTable
        rows={riders.map((r) => ({
          id: r.id,
          name: r.full_name,
          phone: r.phone,
          vehicle: r.vehicle ?? "",
          vendor: r.vendor_id ? (vendors.get(r.vendor_id)?.name ?? "–") : t("riders.platform"),
          active: r.is_active,
        }))}
        editHref={canWrite ? "/admin/food/riders" : undefined}
        columns={[
          { key: "name", header: t("riders.name") },
          { key: "phone", header: t("fields.phone") },
          { key: "vehicle", header: t("riders.vehicle") },
          { key: "vendor", header: t("riders.vendor"), kind: "badge" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
