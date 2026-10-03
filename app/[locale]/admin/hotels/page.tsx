import { Download, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminHotels } from "@/lib/hotels/admin";
import { hasPermission } from "@/lib/permissions/check";

export default async function AdminHotelsPage() {
  const session = await requirePermission("hotels.read", "/admin/hotels");
  const t = await getTranslations();
  const hotels = await listAdminHotels();
  const canWrite = hasPermission(session.permissions, "hotels.write");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("hotelsAdmin.title")}
        lead={t("hotelsAdmin.lead")}
        newHref={canWrite ? "/admin/hotels/new" : undefined}
        newLabel={t("hotelsAdmin.new")}
      >
        <Button asChild variant="outline">
          {/* Route handler, not a localized page: a plain link with no locale prefix. */}
          <a href="/api/admin/hotels/export" download>
            <Download /> {t("hotelsAdmin.exportCsv")}
          </a>
        </Button>
        {canWrite ? (
          <Button asChild variant="outline">
            <Link href="/admin/hotels/import">
              <Upload /> {t("hotelsAdmin.importCsv")}
            </Link>
          </Button>
        ) : null}
      </AdminPageHeader>
      <DataTable
        rows={hotels.map((h) => ({
          id: h.id,
          name: h.name,
          city: h.city,
          property_type: t(`hotelsAdmin.propertyTypes.${h.property_type}`),
          star_rating: h.star_rating,
          status: t(`hotelsAdmin.status.${h.status}`),
          is_featured: h.is_featured,
          is_sponsored: h.is_sponsored,
        }))}
        editHref={canWrite ? "/admin/hotels" : undefined}
        columns={[
          { key: "name", header: t("hotelsAdmin.columns.name"), kind: "localized" },
          { key: "city", header: t("hotelsAdmin.columns.city"), kind: "localized" },
          { key: "property_type", header: t("hotelsAdmin.columns.type") },
          { key: "star_rating", header: t("hotelsAdmin.columns.stars"), kind: "number" },
          { key: "status", header: t("hotelsAdmin.columns.status"), kind: "badge" },
          { key: "is_featured", header: t("hotelsAdmin.columns.featured"), kind: "boolean" },
          { key: "is_sponsored", header: t("hotelsAdmin.columns.sponsored"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
