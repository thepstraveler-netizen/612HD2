import { getTranslations } from "next-intl/server";
import { DeliveryBoard } from "@/components/admin/delivery-board";
import { FoodSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideAutoRefresh } from "@/components/admin/ride-auto-refresh";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { FOOD_KINDS, orderBoardFiltersSchema } from "@/schemas/delivery-admin";

/**
 * Live restaurant and grocery orders: one column per status from placed to
 * out for delivery, then the last day's finished orders. The page
 * re-renders itself every 20 seconds while the tab is visible.
 */
export default async function FoodBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("food.read", "/admin/food");
  const canWrite = hasPermission(session.permissions, "food.write");
  const raw = await searchParams;
  const filters = orderBoardFiltersSchema.parse({
    store: Array.isArray(raw.store) ? raw.store[0] : raw.store,
  });
  const t = await getTranslations("deliveryAdmin");

  return (
    <div className="space-y-6">
      <RideAutoRefresh seconds={20} />
      <AdminPageHeader title={t("food.title")} lead={t("food.boardLead")}>
        <FoodSubnav active="board" />
      </AdminPageHeader>
      <DeliveryBoard kinds={FOOD_KINDS} basePath="/admin/food" filters={filters} canWrite={canWrite} />
    </div>
  );
}
