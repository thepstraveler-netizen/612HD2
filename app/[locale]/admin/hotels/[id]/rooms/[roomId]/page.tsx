import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RoomForm } from "@/components/admin/hotel-room-form";
import { HotelDeleteButton } from "@/components/admin/hotel-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteRoom } from "@/lib/hotels/actions";
import {
  getAdminHotel,
  getHotelFormOptions,
  getRoomFormValues,
  newPlanDefaults,
  newRoomDefaults,
} from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";

export default async function EditRoomPage({ params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id: rawHotel, roomId: rawRoom } = await params;
  const { id: hotelId } = parseEditId(rawHotel);
  if (!hotelId) notFound();
  const { isNew, id: roomId } = parseEditId(rawRoom);
  const list = `/admin/hotels/${hotelId}/rooms`;
  await requirePermission("hotels.write", `${list}/${rawRoom}`);
  const t = await getTranslations("hotelsAdmin");
  const locale = await getLocale();

  const [hotel, options, values] = await Promise.all([
    getAdminHotel(hotelId),
    getHotelFormOptions(),
    roomId ? getRoomFormValues(hotelId, roomId) : null,
  ]);
  if (!hotel || (roomId && !values)) notFound();
  const defaults = values ?? newRoomDefaults(hotelId);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("rooms.newTitle") : pickLocalized(defaults.name, locale)}
        lead={pickLocalized(hotel.name, locale)}
        backHref={list}
        backLabel={t("nav.rooms")}
      />
      <RoomForm
        defaultValues={defaults}
        newPlan={newPlanDefaults()}
        amenities={options.amenities.filter((a) => a.grouping === "room")}
        listHref={list}
        deleteButton={
          roomId ? <HotelDeleteButton id={roomId} action={deleteRoom} redirectTo={list} /> : undefined
        }
      />
    </div>
  );
}
