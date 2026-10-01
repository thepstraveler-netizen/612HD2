import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { OffersSubnav } from "@/components/admin/coupon-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminCoupons } from "@/lib/bookings/admin";
import { couponValueLabel } from "@/lib/bookings/admin-forms";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";

export default async function AdminCouponsPage() {
  const session = await requirePermission("offers.read", "/admin/offers/coupons");
  const [t, format, locale, coupons] = await Promise.all([
    getTranslations("bookingsAdmin.coupons"),
    getFormatter(),
    getLocale(),
    listAdminCoupons(),
  ]);
  const canWrite = hasPermission(session.permissions, "offers.write");
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("title")}
        lead={t("lead")}
        newHref={canWrite ? "/admin/offers/coupons/new" : undefined}
        newLabel={t("new")}
      >
        <OffersSubnav active="coupons" />
      </AdminPageHeader>
      <DataTable
        editHref={canWrite ? "/admin/offers/coupons" : undefined}
        rows={coupons.map((c) => {
          const label = couponValueLabel(c, locale);
          return {
            id: c.id,
            code: c.code,
            description: c.description,
            discount: label.cap ? t("valueWithCap", { value: label.value, cap: label.cap }) : label.value,
            min_order: c.min_order_paise ? formatPaise(c.min_order_paise, locale) : "–",
            validity:
              c.starts_at && c.ends_at
                ? `${day(c.starts_at)} – ${day(c.ends_at)}`
                : c.ends_at
                  ? t("until", { date: day(c.ends_at) })
                  : c.starts_at
                    ? t("from", { date: day(c.starts_at) })
                    : t("always"),
            used: c.usage_limit ? t("usedOf", { used: c.used, limit: c.usage_limit }) : String(c.used),
            is_public: c.is_public,
            is_active: c.is_active,
          };
        })}
        columns={[
          { key: "code", header: t("columns.code") },
          { key: "description", header: t("columns.description"), kind: "localized" },
          { key: "discount", header: t("columns.discount") },
          { key: "min_order", header: t("columns.minOrder") },
          { key: "validity", header: t("columns.validity") },
          { key: "used", header: t("columns.used") },
          { key: "is_public", header: t("columns.public"), kind: "boolean" },
          { key: "is_active", header: t("columns.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
