import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PointForm } from "@/components/admin/ride-catalog-forms";
import { RideDeleteButton } from "@/components/admin/ride-shared";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { pickLocalized } from "@/lib/i18n/localized";
import { getPoint, listZones } from "@/lib/rides/admin";
import { deletePoint } from "@/lib/rides/admin-actions";
import { newPointValues, pointFormValues } from "@/lib/rides/admin-rows";

const LIST = "/admin/rides/points";

export default async function EditRidePointPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("rides.write", `${LIST}/${raw}`);
  const [t, locale, zones, point, query] = await Promise.all([
    getTranslations("admin.rides"),
    getLocale(),
    listZones(),
    id ? getPoint(id) : null,
    searchParams,
  ]);
  if (id && !point) notFound();
  // A new landmark starts in the zone the list was filtered by.
  const wanted = Array.isArray(query.zone) ? query.zone[0] : query.zone;
  const zoneId = zones.find((zn) => zn.id === wanted)?.id ?? zones[0]?.id;
  if (!point && !zoneId) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={point ? pickLocalized(point.name, locale) : t("points.newTitle")}
        backHref={LIST}
        backLabel={t("points.title")}
      />
      <PointForm
        defaultValues={point ? pointFormValues(point) : newPointValues(zoneId ?? "")}
        zones={zones.map((zn) => ({ value: zn.id, label: zn.name }))}
        listHref={LIST}
        deleteButton={
          id ? (
            <RideDeleteButton
              id={id}
              action={deletePoint}
              redirectTo={LIST}
              confirmText={t("points.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
