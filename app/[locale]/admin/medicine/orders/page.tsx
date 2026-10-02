import { getTranslations } from "next-intl/server";
import { DeliveryBoard } from "@/components/admin/delivery-board";
import { MedicineSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideAutoRefresh } from "@/components/admin/ride-auto-refresh";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { PHARMACY_KINDS, orderBoardFiltersSchema } from "@/schemas/delivery-admin";

/** Live medicine orders (accepted quotes), on the same board as food. */
export default async function MedicineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("medicine.read", "/admin/medicine/orders");
  const canWrite = hasPermission(session.permissions, "medicine.write");
  const raw = await searchParams;
  const filters = orderBoardFiltersSchema.parse({
    store: Array.isArray(raw.store) ? raw.store[0] : raw.store,
  });
  const t = await getTranslations("deliveryAdmin");

  return (
    <div className="space-y-6">
      <RideAutoRefresh seconds={20} />
      <AdminPageHeader title={t("medicine.title")} lead={t("medicine.ordersLead")}>
        <MedicineSubnav active="orders" />
      </AdminPageHeader>
      <DeliveryBoard
        kinds={PHARMACY_KINDS}
        basePath="/admin/medicine/orders"
        filters={filters}
        canWrite={canWrite}
      />
    </div>
  );
}
