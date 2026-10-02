import { getTranslations } from "next-intl/server";
import { DeliverySettlements } from "@/components/admin/delivery-settlements";
import { FoodSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { settlementRange } from "@/lib/delivery/admin-rows";
import { FOOD_KINDS, settlementFiltersSchema } from "@/schemas/delivery-admin";

export default async function FoodSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("food.read", "/admin/food/settlements");
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = settlementRange(settlementFiltersSchema.parse({ from: one(raw.from), to: one(raw.to) }));
  const t = await getTranslations("deliveryAdmin");

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("settlements.title")} lead={t("settlements.lead")}>
        <FoodSubnav active="settlements" />
      </AdminPageHeader>
      <DeliverySettlements kinds={FOOD_KINDS} range={range} />
    </div>
  );
}
