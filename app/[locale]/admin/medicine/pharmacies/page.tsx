import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { MedicineSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminStores } from "@/lib/delivery/admin";
import { hasPermission } from "@/lib/permissions/check";
import { PHARMACY_KINDS } from "@/schemas/delivery-admin";

export default async function PharmaciesPage() {
  const session = await requirePermission("medicine.read", "/admin/medicine/pharmacies");
  const canWrite = hasPermission(session.permissions, "medicine.write");
  const [t, stores] = await Promise.all([getTranslations("deliveryAdmin"), listAdminStores(PHARMACY_KINDS)]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("pharmacies.title")}
        lead={t("pharmacies.lead")}
        newHref={canWrite ? "/admin/medicine/pharmacies/new" : undefined}
        newLabel={t("pharmacies.new")}
      >
        <MedicineSubnav active="pharmacies" />
      </AdminPageHeader>
      <DataTable
        rows={stores.map((s) => ({
          id: s.id,
          name: s.name,
          vendor: s.vendorName,
          licence: s.drug_licence_no ?? "",
          zones: s.zoneCount,
          accepting: s.accepting_orders,
          active: s.is_active,
          sort: s.sort_order,
        }))}
        editHref={canWrite ? "/admin/medicine/pharmacies" : undefined}
        columns={[
          { key: "name", header: t("fields.name"), kind: "localized" },
          { key: "vendor", header: t("stores.vendor") },
          { key: "licence", header: t("stores.drugLicence") },
          { key: "zones", header: t("stores.zones"), kind: "number" },
          { key: "accepting", header: t("stores.acceptingShort"), kind: "boolean" },
          { key: "active", header: t("fields.active"), kind: "boolean" },
          { key: "sort", header: t("fields.sortOrder"), kind: "number" },
        ]}
      />
    </div>
  );
}
