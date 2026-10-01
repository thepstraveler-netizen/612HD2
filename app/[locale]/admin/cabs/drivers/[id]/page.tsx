import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FleetDocuments } from "@/components/admin/cab-documents";
import { FleetAlerts } from "@/components/admin/cab-expiry";
import { DriverForm } from "@/components/admin/cab-fleet-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getDriver, listFleetDocuments } from "@/lib/cabs/admin";
import { deleteDriver } from "@/lib/cabs/admin-actions";
import { NEW_DRIVER, driverFormValues } from "@/lib/cabs/admin-rows";
import { fleetExpiryAlerts } from "@/lib/cabs/expiry";
import { todayInIndia } from "@/lib/dates";

const LIST = "/admin/cabs/drivers";

export default async function EditCabDriverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, detail, documents] = await Promise.all([
    getTranslations("cabsAdmin"),
    id ? getDriver(id) : null,
    id ? listFleetDocuments("driver", id) : [],
  ]);
  if (id && !detail) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={detail ? detail.driver.full_name : t("drivers.newTitle")}
        backHref={LIST}
        backLabel={t("drivers.title")}
      />
      {detail ? <FleetAlerts alerts={fleetExpiryAlerts([detail.driver], [], todayInIndia())} /> : null}
      <DriverForm
        defaultValues={detail ? driverFormValues(detail.driver, detail.loginEmail) : NEW_DRIVER}
        editHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deleteDriver}
              redirectTo={LIST}
              confirmText={t("drivers.confirmDelete")}
            />
          ) : undefined
        }
      />
      {id ? <FleetDocuments ownerType="driver" ownerId={id} documents={documents} canWrite /> : null}
    </div>
  );
}
