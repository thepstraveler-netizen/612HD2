import { getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listPlaces } from "@/lib/cabs/admin";
import { hasPermission } from "@/lib/permissions/check";

export default async function CabPlacesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/places");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, places] = await Promise.all([getTranslations("cabsAdmin"), listPlaces()]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("places.title")}
        lead={t("places.lead")}
        newHref={canWrite ? "/admin/cabs/places/new" : undefined}
        newLabel={t("places.new")}
      >
        <CabSubnav active="places" />
      </AdminPageHeader>
      <DataTable
        rows={places.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          kind: t(`places.kinds.${p.kind}`),
          coords: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
          popular: p.is_popular,
          active: p.is_active,
          sort: p.sort_order,
        }))}
        editHref={canWrite ? "/admin/cabs/places" : undefined}
        columns={[
          { key: "name", header: t("columns.name"), kind: "localized" },
          { key: "slug", header: t("columns.slug") },
          { key: "kind", header: t("places.kind"), kind: "badge" },
          { key: "coords", header: t("places.coords"), sortable: false },
          { key: "popular", header: t("fields.popular"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
