import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { HotelSubnav } from "@/components/admin/hotel-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminHotel, getHotelRooms, getPricingRules } from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";

export default async function HotelPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  if (!id) notFound();
  const base = `/admin/hotels/${id}/pricing`;
  await requirePermission("hotels.write", base);
  const t = await getTranslations("hotelsAdmin");
  const locale = await getLocale();
  const [hotel, rules, rooms] = await Promise.all([
    getAdminHotel(id),
    getPricingRules(id),
    getHotelRooms(id),
  ]);
  if (!hotel) notFound();

  const roomName = new Map(rooms.map((r) => [r.id, pickLocalized(r.name, locale)]));
  const planName = new Map(
    rooms.flatMap((r) =>
      r.plans.map((p) => [p.id, `${roomName.get(r.id)} · ${pickLocalized(p.name, locale)}`]),
    ),
  );
  const describe = (adjustment: string, value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const abs = Math.abs(value);
    if (adjustment === "percent") return `${sign}${abs / 100}%`;
    if (adjustment === "flat") return `${sign}${formatPaise(abs, locale)}`;
    return t("pricing.fixedValue", { price: formatPaise(value, locale) });
  };
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={pickLocalized(hotel.name, locale)}
        lead={t("pricing.lead")}
        backHref="/admin/hotels"
        backLabel={t("backToList")}
        newHref={`${base}/new`}
        newLabel={t("pricing.new")}
      >
        <HotelSubnav hotelId={id} active="pricing" />
      </AdminPageHeader>
      <DataTable
        rows={rules.map((r) => ({
          id: r.id,
          name: r.name,
          dates: `${fmt(r.start_date)} – ${fmt(r.end_date)}`,
          weekdays: r.weekdays.length ? r.weekdays.map((d) => t(`weekdays.${d}`)).join(", ") : t("allDays"),
          scope: r.rate_plan_id
            ? (planName.get(r.rate_plan_id) ?? "")
            : r.room_id
              ? (roomName.get(r.room_id) ?? "")
              : t("pricing.allRooms"),
          adjustment: t(`pricing.adjustments.${r.adjustment}`),
          value: describe(r.adjustment, r.value),
          priority: r.priority,
          active: r.is_active,
        }))}
        editHref={base}
        columns={[
          { key: "name", header: t("columns.name") },
          { key: "dates", header: t("columns.dates"), sortable: false },
          { key: "weekdays", header: t("columns.weekdays"), sortable: false },
          { key: "scope", header: t("columns.scope") },
          { key: "adjustment", header: t("columns.adjustment") },
          { key: "value", header: t("columns.value"), sortable: false },
          { key: "priority", header: t("columns.priority"), kind: "number" },
          { key: "active", header: t("columns.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
