import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { HotelSubnav } from "@/components/admin/hotel-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminHotel, getHotelRooms } from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";

export default async function HotelRoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  if (!id) notFound();
  const base = `/admin/hotels/${id}/rooms`;
  await requirePermission("hotels.write", base);
  const t = await getTranslations();
  const locale = await getLocale();
  const hotel = await getAdminHotel(id);
  if (!hotel) notFound();
  const rooms = await getHotelRooms(id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={pickLocalized(hotel.name, locale)}
        lead={t("hotelsAdmin.rooms.lead")}
        backHref="/admin/hotels"
        backLabel={t("hotelsAdmin.backToList")}
        newHref={`${base}/new`}
        newLabel={t("hotelsAdmin.rooms.new")}
      >
        <HotelSubnav hotelId={id} active="rooms" />
      </AdminPageHeader>
      <DataTable
        rows={rooms.map((r) => {
          const prices = r.plans.filter((p) => p.isActive).map((p) => p.basePricePaise);
          return {
            id: r.id,
            name: r.name,
            units: r.totalUnits,
            occupancy: t("hotelsAdmin.rooms.occupancyValue", {
              base: r.baseOccupancy,
              max: r.maxOccupancy,
            }),
            plans: r.plans.length,
            from: prices.length ? formatPaise(Math.min(...prices), locale) : "",
            active: r.isActive,
          };
        })}
        editHref={base}
        columns={[
          { key: "name", header: t("hotelsAdmin.columns.name"), kind: "localized" },
          { key: "units", header: t("hotelsAdmin.columns.units"), kind: "number" },
          { key: "occupancy", header: t("hotelsAdmin.columns.occupancy"), sortable: false },
          { key: "plans", header: t("hotelsAdmin.columns.plans"), kind: "number" },
          { key: "from", header: t("hotelsAdmin.columns.from"), sortable: false },
          { key: "active", header: t("hotelsAdmin.columns.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
