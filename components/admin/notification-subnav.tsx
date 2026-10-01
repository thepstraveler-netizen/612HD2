import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

/** Templates | Delivery log. */
export async function NotificationSubnav({ active }: { active: "templates" | "logs" }) {
  const t = await getTranslations("bookingsAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={[
        { key: "templates", href: "/admin/notifications", label: t("templates") },
        { key: "logs", href: "/admin/notifications/logs", label: t("logs") },
      ]}
    />
  );
}
