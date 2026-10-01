import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const CAB_AREAS = [
  "dispatch",
  "trips",
  "routes",
  "fares",
  "packages",
  "places",
  "categories",
  "addons",
  "surcharges",
  "drivers",
  "vehicles",
] as const;
export type CabArea = (typeof CAB_AREAS)[number];

/** Dispatch | Trips | Routes | … | Vehicles, at the top of every cabs admin page. */
export async function CabSubnav({ active }: { active: CabArea }) {
  const t = await getTranslations("cabsAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={CAB_AREAS.map((key) => ({
        key,
        href: key === "dispatch" ? "/admin/cabs" : `/admin/cabs/${key}`,
        label: t(key),
      }))}
    />
  );
}
