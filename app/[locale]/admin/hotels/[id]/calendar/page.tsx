import { BedDouble, ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { CalendarEditForm } from "@/components/admin/hotel-calendar-form";
import { HotelCalendarGrid } from "@/components/admin/hotel-calendar-grid";
import { HotelSubnav } from "@/components/admin/hotel-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { addDays, todayInIndia } from "@/lib/dates";
import { getAdminHotel, getHotelRooms, getRoomCalendar } from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";

const querySchema = z.object({
  room: z.uuid().optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function HotelCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  if (!id) notFound();
  const base = `/admin/hotels/${id}/calendar`;
  await requirePermission("hotels.write", base);
  const sp = await searchParams;
  const query = querySchema.parse({
    room: typeof sp.room === "string" ? sp.room : undefined,
    month: typeof sp.month === "string" ? sp.month : undefined,
  });
  const t = await getTranslations("hotelsAdmin");
  const locale = await getLocale();

  const [hotel, rooms] = await Promise.all([getAdminHotel(id), getHotelRooms(id)]);
  if (!hotel) notFound();

  const header = (
    <AdminPageHeader
      title={pickLocalized(hotel.name, locale)}
      lead={t("calendar.lead")}
      backHref="/admin/hotels"
      backLabel={t("backToList")}
    >
      <HotelSubnav hotelId={id} active="calendar" />
    </AdminPageHeader>
  );

  const room = rooms.find((r) => r.id === query.room) ?? rooms[0];
  if (!room) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={BedDouble}
          title={t("calendar.noRooms")}
          description={t("calendar.noRoomsLead")}
          action={
            <Button asChild>
              <Link href={`/admin/hotels/${id}/rooms/new`}>{t("rooms.new")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const today = todayInIndia();
  const month = query.month ?? today.slice(0, 7);
  const from = `${month}-01`;
  const to = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const calendar = await getRoomCalendar(id, room, from, to);
  const href = (m: string) => `${base}?room=${room.id}&month=${m}`;
  const monthLabel = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${from}T00:00:00Z`));
  const editStart = from > today ? from : today <= to ? today : from;

  return (
    <div className="space-y-6">
      {header}
      <nav aria-label={t("calendar.room")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {rooms.map((r) => (
          <Link
            key={r.id}
            href={`${base}?room=${r.id}&month=${month}`}
            aria-current={r.id === room.id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-sm font-medium",
              r.id === room.id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent",
            )}
          >
            {pickLocalized(r.name, locale)}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="outline" size="icon">
              <Link href={href(shiftMonth(month, -1))} aria-label={t("calendar.prevMonth")}>
                <ChevronLeft />
              </Link>
            </Button>
            <h2 className="text-lg font-semibold">{monthLabel}</h2>
            <Button asChild variant="outline" size="icon">
              <Link href={href(shiftMonth(month, 1))} aria-label={t("calendar.nextMonth")}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <HotelCalendarGrid room={room} calendar={calendar} from={from} to={to} today={today} />
          <p className="text-xs text-muted-foreground">{t("calendar.legend")}</p>
        </div>
        <CalendarEditForm
          key={`${room.id}|${month}`}
          hotelId={id}
          roomId={room.id}
          plans={room.plans.map((p) => ({ value: p.id, label: pickLocalized(p.name, locale) }))}
          defaultStart={editStart}
          defaultEnd={editStart}
        />
      </div>
    </div>
  );
}
