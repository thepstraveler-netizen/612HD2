import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const HOTEL_AREAS = ["details", "rooms", "calendar", "pricing"] as const;
export type HotelArea = (typeof HOTEL_AREAS)[number];

/** Details | Rooms & rates | Calendar | Pricing rules, for one existing hotel. */
export async function HotelSubnav({ hotelId, active }: { hotelId: string; active: HotelArea }) {
  const t = await getTranslations("hotelsAdmin.nav");
  const base = `/admin/hotels/${hotelId}`;
  return (
    <AdminSubnav
      active={active}
      items={HOTEL_AREAS.map((key) => ({
        key,
        href: key === "details" ? base : `${base}/${key}`,
        label: t(key),
      }))}
    />
  );
}
