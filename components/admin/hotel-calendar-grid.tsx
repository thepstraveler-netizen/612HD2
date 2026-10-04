import { getLocale, getTranslations } from "next-intl/server";
import { availableUnits, nightlyRate, type CalendarIndex } from "@/lib/availability/engine";
import { dateRange, isoWeekday, type IsoDate } from "@/lib/dates";
import type { AdminRoom } from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Month view of one room: units left, sold and held (by unpaid bookings,
 * until their hold expires), stop-sell and min stay per date, and
 * each plan's nightly price as guests would pay it (overrides and pricing
 * rules applied by the same engine the public pages use).
 */
export async function HotelCalendarGrid({
  room,
  calendar,
  from,
  to,
  today,
}: {
  room: AdminRoom;
  calendar: CalendarIndex;
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
}) {
  const t = await getTranslations("hotelsAdmin");
  const tb = await getTranslations("bookingsAdmin.calendar");
  const locale = await getLocale();
  const dates = dateRange(from, to);
  const leading = isoWeekday(from) - 1;

  return (
    <>
      {/* Phones: one row per date instead of a seven-column grid. */}
      <ol className="divide-y rounded-2xl border bg-card md:hidden">
        {dates.map((date) => {
          const day = calendar.inventory.get(`${room.id}|${date}`);
          const closed = day?.isClosed ?? false;
          const left = availableUnits(room, date, calendar);
          const past = date < today;
          return (
            <li
              key={date}
              className={cn("flex gap-3 p-3 text-sm", closed && "bg-destructive/10", past && "opacity-50")}
            >
              <div
                className={cn(
                  "grid w-12 shrink-0 content-start justify-items-center rounded-xl border bg-background py-1",
                  date === today && "border-primary text-primary",
                )}
              >
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                  {t(`weekdays.${isoWeekday(date)}`)}
                </span>
                <span className="text-lg leading-tight font-bold">{Number(date.slice(8))}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  {closed ? (
                    <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {t("calendar.closed")}
                    </span>
                  ) : (
                    <span
                      className={cn("font-semibold", left === 0 ? "text-destructive" : "text-accent-green")}
                    >
                      {t("calendar.left", { count: left })}
                    </span>
                  )}
                  {day?.soldUnits ? (
                    <span className="text-muted-foreground">
                      {t("calendar.sold", { count: day.soldUnits })}
                    </span>
                  ) : null}
                  {day?.heldUnits ? (
                    <span className="text-accent-amber" title={tb("heldTitle")}>
                      {tb("held", { count: day.heldUnits })}
                    </span>
                  ) : null}
                  {day?.minStay && day.minStay > 1 ? (
                    <span className="text-muted-foreground">
                      {t("calendar.minStayShort", { count: day.minStay })}
                    </span>
                  ) : null}
                </div>
                <ul className="grid gap-0.5">
                  {room.plans.map((plan) => {
                    const overridden = calendar.rates.has(`${plan.id}|${date}`);
                    return (
                      <li
                        key={plan.id}
                        className={cn(
                          "flex justify-between gap-2",
                          !plan.isActive && "line-through opacity-60",
                        )}
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {pickLocalized(plan.name, locale)}
                        </span>
                        <span
                          className={cn("shrink-0 font-medium tabular-nums", overridden && "text-primary")}
                        >
                          {formatPaise(nightlyRate(plan, date, calendar), locale)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <div className="grid min-w-[44rem] grid-cols-7">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div
              key={d}
              className="border-b bg-muted/50 px-2 py-2 text-xs font-semibold text-muted-foreground uppercase"
            >
              {t(`weekdays.${d}`)}
            </div>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <div key={`blank-${i}`} className="border-r border-b bg-muted/20" aria-hidden="true" />
          ))}
          {dates.map((date) => {
            const day = calendar.inventory.get(`${room.id}|${date}`);
            const closed = day?.isClosed ?? false;
            const left = availableUnits(room, date, calendar);
            const past = date < today;
            return (
              <div
                key={date}
                className={cn(
                  "min-h-28 space-y-1 border-r border-b p-2 text-xs",
                  closed && "bg-destructive/10",
                  past && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={cn("text-sm font-semibold", date === today && "text-primary")}>
                    {Number(date.slice(8))}
                  </span>
                  {closed ? (
                    <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {t("calendar.closed")}
                    </span>
                  ) : (
                    <span
                      className={cn("font-medium", left === 0 ? "text-destructive" : "text-accent-green")}
                    >
                      {t("calendar.left", { count: left })}
                    </span>
                  )}
                </div>
                {day?.soldUnits || day?.heldUnits ? (
                  <div className="text-muted-foreground">
                    {day.soldUnits ? t("calendar.sold", { count: day.soldUnits }) : null}
                    {day.soldUnits && day.heldUnits ? " · " : null}
                    {day.heldUnits ? (
                      <span className="text-accent-amber" title={tb("heldTitle")}>
                        {tb("held", { count: day.heldUnits })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {day?.minStay && day.minStay > 1 ? (
                  <div className="text-muted-foreground">
                    {t("calendar.minStayShort", { count: day.minStay })}
                  </div>
                ) : null}
                <ul className="space-y-0.5">
                  {room.plans.map((plan) => {
                    const overridden = calendar.rates.has(`${plan.id}|${date}`);
                    return (
                      <li
                        key={plan.id}
                        className={cn("truncate", !plan.isActive && "line-through opacity-60")}
                        title={pickLocalized(plan.name, locale)}
                      >
                        <span className={cn("font-medium", overridden && "text-primary")}>
                          {formatPaise(nightlyRate(plan, date, calendar), locale)}
                        </span>{" "}
                        <span className="text-muted-foreground">{pickLocalized(plan.name, locale)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
