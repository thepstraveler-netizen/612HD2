import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { indiaTime } from "@/components/admin/cab-trip-card";
import { DataTable } from "@/components/admin/data-table";
import { MedicineSubnav } from "@/components/admin/delivery-subnav";
import { AdminPageHeader, AdminSubnav } from "@/components/admin/page-header";
import { RideAutoRefresh } from "@/components/admin/ride-auto-refresh";
import { requirePermission } from "@/lib/auth/guards";
import { listPrescriptions, prescriptionCounts, storeOptions, zoneNames } from "@/lib/delivery/admin";
import { prescriptionTabStatuses, prescriptionTone } from "@/lib/delivery/admin-rows";
import { PHARMACY_KINDS, PRESCRIPTION_TABS, prescriptionTabSchema } from "@/schemas/delivery-admin";

/**
 * Prescription review queue: new uploads first (oldest waiting longest),
 * then tabs for quoted, ordered, rejected and expired. Refreshes itself
 * every 30 seconds while visible.
 */
export default async function PrescriptionQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("medicine.read", "/admin/medicine");
  const raw = await searchParams;
  const tab = prescriptionTabSchema.parse(Array.isArray(raw.status) ? raw.status[0] : raw.status);
  const locale = await getLocale();
  const [t, format, rows, counts, zones, pharmacies] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getFormatter(),
    listPrescriptions(prescriptionTabStatuses(tab)),
    prescriptionCounts(),
    zoneNames(locale),
    storeOptions(PHARMACY_KINDS, locale),
  ]);
  const pharmacyName = new Map(pharmacies.map((p) => [p.value, p.label]));
  const tabCount = (key: (typeof PRESCRIPTION_TABS)[number]) => {
    const statuses = prescriptionTabStatuses(key);
    return statuses
      ? statuses.reduce((n, s) => n + (counts[s] ?? 0), 0)
      : Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  };

  return (
    <div className="space-y-6">
      <RideAutoRefresh seconds={30} />
      <AdminPageHeader title={t("medicine.title")} lead={t("prescriptions.lead")}>
        <MedicineSubnav active="prescriptions" />
      </AdminPageHeader>
      <AdminSubnav
        active={tab}
        items={PRESCRIPTION_TABS.map((key) => ({
          key,
          href: key === "open" ? "/admin/medicine" : `/admin/medicine?status=${key}`,
          label: `${t(`prescriptions.tabs.${key}`)} (${tabCount(key)})`,
        }))}
      />
      <DataTable
        rows={rows.map((p) => ({
          id: p.id,
          received: indiaTime(format, p.created_at),
          patient: p.patient_age === null ? p.patient_name : `${p.patient_name} (${p.patient_age})`,
          phone: p.phone,
          zone: zones.get(p.zone_id) ?? "–",
          files: p.files.length,
          pharmacy: p.store_id ? (pharmacyName.get(p.store_id) ?? "–") : "–",
          status: { label: t(`prescriptionStatus.${p.status}`), tone: prescriptionTone(p.status) },
        }))}
        editHref="/admin/medicine/prescriptions"
        editLabel={t("prescriptions.open")}
        columns={[
          { key: "received", header: t("prescriptions.received"), sortable: false },
          { key: "patient", header: t("prescriptions.patient") },
          { key: "phone", header: t("fields.phone") },
          { key: "zone", header: t("prescriptions.zone") },
          { key: "files", header: t("prescriptions.files"), kind: "number" },
          { key: "pharmacy", header: t("prescriptions.pharmacy") },
          { key: "status", header: t("prescriptions.status"), kind: "tone" },
        ]}
      />
    </div>
  );
}
