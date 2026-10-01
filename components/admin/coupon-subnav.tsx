import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

/** Banners | Coupons, on the Offers pages. */
export async function OffersSubnav({ active }: { active: "banners" | "coupons" }) {
  const t = await getTranslations("bookingsAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={[
        { key: "banners", href: "/admin/offers", label: t("banners") },
        { key: "coupons", href: "/admin/offers/coupons", label: t("coupons") },
      ]}
    />
  );
}
