import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PlaceForm } from "@/components/admin/cab-catalog-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getPlace } from "@/lib/cabs/admin";
import { deletePlace } from "@/lib/cabs/admin-actions";
import { NEW_PLACE, placeFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/places";

export default async function EditCabPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, place] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    id ? getPlace(id) : null,
  ]);
  if (id && !place) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={place ? pickLocalized(place.name, locale) : t("places.newTitle")}
        backHref={LIST}
        backLabel={t("places.title")}
      />
      <PlaceForm
        defaultValues={place ? placeFormValues(place) : NEW_PLACE}
        listHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deletePlace}
              redirectTo={LIST}
              confirmText={t("places.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
