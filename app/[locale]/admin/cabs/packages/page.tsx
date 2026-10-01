import { getLocale, getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listPackages } from "@/lib/cabs/admin";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabPackagesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/packages");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, locale, packages] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listPackages(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("packages.title")}
        lead={t("packages.lead")}
        newHref={canWrite ? "/admin/cabs/packages/new" : undefined}
        newLabel={t("packages.new")}
      >
        <CabSubnav active="packages" />
      </AdminPageHeader>
      <DataTable
        rows={packages.map((p) => ({
          id: p.id,
          name: p.name,
          key: p.key,
          hours: p.hours,
          km: p.km,
          fares: p.fareCount,
          from: p.fromPaise === null ? "–" : formatPaise(p.fromPaise, locale),
          active: p.is_active,
          sort: p.sort_order,
        }))}
        editHref={canWrite ? "/admin/cabs/packages" : undefined}
        columns={[
          { key: "name", header: t("columns.name"), kind: "localized" },
          { key: "key", header: t("fields.key") },
          { key: "hours", header: t("packages.hours"), kind: "number" },
          { key: "km", header: t("packages.km"), kind: "number" },
          { key: "fares", header: t("routes.fareCount"), kind: "number" },
          { key: "from", header: t("packages.from"), sortable: false },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
