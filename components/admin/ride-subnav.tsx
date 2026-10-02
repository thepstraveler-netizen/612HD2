import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const RIDE_AREAS = ["board", "types", "zones", "points", "fares", "vehicles"] as const;
export type RideArea = (typeof RIDE_AREAS)[number];

/** Live requests | Vehicle types | Zones | Landmarks | Fares | Vehicles, on every rides admin page. */
export async function RideSubnav({ active }: { active: RideArea }) {
  const t = await getTranslations("admin.rides.nav");
  return (
    <AdminSubnav
      active={active}
      items={RIDE_AREAS.map((key) => ({
        key,
        href: key === "board" ? "/admin/rides" : `/admin/rides/${key}`,
        label: t(key),
      }))}
    />
  );
}
