import { getTranslations } from "next-intl/server";
import { OffersSubnav } from "@/components/admin/coupon-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOffersPage() {
  const session = await requirePermission("offers.read", "/admin/offers");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("offers_banners")
    .select("id, title, tab, coupon_code, starts_at, ends_at, sort_order, is_active")
    .order("sort_order");
  const canWrite = hasPermission(session.permissions, "offers.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("cms.nav.banners")}
        lead={t("cms.offersLead")}
        newHref={canWrite ? "/admin/offers/new" : undefined}
        newLabel={t("cms.actions.new")}
      >
        <OffersSubnav active="banners" />
      </AdminPageHeader>
      <DataTable
        rows={data ?? []}
        editHref={canWrite ? "/admin/offers" : undefined}
        columns={[
          { key: "title", header: t("cms.fields.title"), kind: "localized" },
          { key: "tab", header: t("cms.fields.tab"), kind: "badge" },
          { key: "coupon_code", header: t("cms.fields.couponCode") },
          { key: "starts_at", header: t("cms.fields.startsAt"), kind: "date" },
          { key: "ends_at", header: t("cms.fields.endsAt"), kind: "date" },
          { key: "sort_order", header: t("cms.fields.sortOrder"), kind: "number" },
          { key: "is_active", header: t("cms.fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
