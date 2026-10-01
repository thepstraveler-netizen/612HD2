import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { HotelForm } from "@/components/admin/hotel-form";
import { HotelGallery } from "@/components/admin/hotel-gallery";
import { HotelDeleteButton } from "@/components/admin/hotel-shared";
import { HotelSubnav } from "@/components/admin/hotel-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteHotel } from "@/lib/hotels/actions";
import {
  getHotelFormOptions,
  getHotelFormValues,
  getHotelGallery,
  newHotelDefaults,
} from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { MapPin } from "lucide-react";

const LIST = "/admin/hotels";

export default async function EditHotelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("hotels.write", `${LIST}/${raw}`);
  const t = await getTranslations();
  const locale = await getLocale();

  const options = await getHotelFormOptions();
  const [values, gallery] = id
    ? await Promise.all([getHotelFormValues(id), getHotelGallery(id)])
    : [null, []];
  if (id && !values) notFound();
  const firstCity = options.cities[0]?.value;
  if (isNew && !firstCity) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title={t("hotelsAdmin.newTitle")}
          backHref={LIST}
          backLabel={t("hotelsAdmin.backToList")}
        />
        <EmptyState
          icon={MapPin}
          title={t("hotelsAdmin.noCities")}
          description={t("hotelsAdmin.noCitiesLead")}
        />
      </div>
    );
  }
  const defaults = values ?? newHotelDefaults(firstCity ?? "");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={
          isNew
            ? t("hotelsAdmin.newTitle")
            : pickLocalized(defaults.name, locale) || t("hotelsAdmin.editTitle")
        }
        backHref={LIST}
        backLabel={t("hotelsAdmin.backToList")}
      >
        {id ? <HotelSubnav hotelId={id} active="details" /> : null}
      </AdminPageHeader>
      <HotelForm
        defaultValues={defaults}
        options={options}
        editHref={LIST}
        deleteButton={id ? <HotelDeleteButton id={id} action={deleteHotel} redirectTo={LIST} /> : undefined}
      />
      {id ? (
        <HotelGallery hotelId={id} initial={gallery} alt={{ en: defaults.name.en, hi: defaults.name.hi }} />
      ) : null}
    </div>
  );
}
