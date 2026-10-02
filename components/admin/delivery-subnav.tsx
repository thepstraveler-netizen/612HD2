import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const FOOD_AREAS = ["board", "stores", "zones", "riders", "settlements"] as const;
export type FoodArea = (typeof FOOD_AREAS)[number];

export const MEDICINE_AREAS = ["prescriptions", "orders", "pharmacies", "settlements"] as const;
export type MedicineArea = (typeof MEDICINE_AREAS)[number];

/** Orders | Stores | Zones | Riders | Settlements, on every Food & Essentials admin page. */
export async function FoodSubnav({ active }: { active: FoodArea }) {
  const t = await getTranslations("deliveryAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={FOOD_AREAS.map((key) => ({
        key,
        href: key === "board" ? "/admin/food" : `/admin/food/${key}`,
        label: t(key),
      }))}
    />
  );
}

/** Prescriptions | Orders | Pharmacies | Settlements, on every Medicine admin page. */
export async function MedicineSubnav({ active }: { active: MedicineArea }) {
  const t = await getTranslations("deliveryAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={MEDICINE_AREAS.map((key) => ({
        key,
        href: key === "prescriptions" ? "/admin/medicine" : `/admin/medicine/${key}`,
        label: t(key),
      }))}
    />
  );
}
