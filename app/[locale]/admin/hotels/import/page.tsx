import { getTranslations } from "next-intl/server";
import { HotelImport } from "@/components/admin/hotel-import";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";

export default async function AdminHotelImportPage() {
  await requirePermission("hotels.write", "/admin/hotels/import");
  const t = await getTranslations("hotelsAdmin");
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("import.title")}
        lead={t("import.lead")}
        backHref="/admin/hotels"
        backLabel={t("backToList")}
      />
      <HotelImport />
    </div>
  );
}
