import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const PAYMENT_AREAS = ["payments", "refunds", "events", "settlements"] as const;
export type PaymentArea = (typeof PAYMENT_AREAS)[number];

/** Payments | Refunds | Webhook events | Vendor settlements. */
export async function PaymentSubnav({ active }: { active: PaymentArea }) {
  const t = await getTranslations("bookingsAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={PAYMENT_AREAS.map((key) => ({
        key,
        href: key === "payments" ? "/admin/payments" : `/admin/payments/${key}`,
        label: t(key),
      }))}
    />
  );
}
