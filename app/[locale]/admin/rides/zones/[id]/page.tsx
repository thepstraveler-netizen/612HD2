import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ZoneForm } from "@/components/admin/ride-catalog-forms";
import { RideDeleteButton } from "@/components/admin/ride-shared";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { getZone } from "@/lib/rides/admin";
import { deleteZone } from "@/lib/rides/admin-actions";
import { NEW_ZONE, zoneFormValues } from "@/lib/rides/admin-rows";

const LIST = "/admin/rides/zones";

export default async function EditRideZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("rides.write", `${LIST}/${raw}`);
  const [t, locale, zone] = await Promise.all([
    getTranslations("admin.rides"),
    getLocale(),
    id ? getZone(id) : null,
  ]);
  if (id && !zone) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={zone ? pickLocalized(zone.name, locale) : t("zones.newTitle")}
        backHref={LIST}
        backLabel={t("zones.title")}
      />
      <ZoneForm
        defaultValues={zone ? zoneFormValues(zone) : NEW_ZONE}
        listHref={LIST}
        deleteButton={
          id ? (
            <RideDeleteButton
              id={id}
              action={deleteZone}
              redirectTo={LIST}
              confirmText={t("zones.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
