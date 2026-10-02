import { getTranslations } from "next-intl/server";
import { DeliverySettlements } from "@/components/admin/delivery-settlements";
import { MedicineSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { settlementRange } from "@/lib/delivery/admin-rows";
import { PHARMACY_KINDS, settlementFiltersSchema } from "@/schemas/delivery-admin";

export default async function MedicineSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("medicine.read", "/admin/medicine/settlements");
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = settlementRange(settlementFiltersSchema.parse({ from: one(raw.from), to: one(raw.to) }));
  const t = await getTranslations("deliveryAdmin");

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("settlements.title")} lead={t("settlements.medicineLead")}>
        <MedicineSubnav active="settlements" />
      </AdminPageHeader>
      <DeliverySettlements kinds={PHARMACY_KINDS} range={range} />
    </div>
  );
}
