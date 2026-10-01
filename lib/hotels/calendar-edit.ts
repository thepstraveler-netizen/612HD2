import type { z } from "zod";
import { dateRange, isoWeekday, type IsoDate } from "@/lib/dates";
import type { calendarEditSchema } from "@/schemas/hotels";

/**
 * Bulk calendar edit → the rows to write. Pure: the server action reads the
 * existing inventory rows, calls {@link planCalendarEdit}, then writes.
 *
 * Inventory upserts always carry units, is_closed and min_stay (a bulk
 * upsert sends one column set for every row), so untouched values are
 * merged from the existing row. `sold_units` is never sent: bookings own it.
 */

export type CalendarEdit = z.output<typeof calendarEditSchema>;

export type ExistingInventory = {
  date: IsoDate;
  units: number | null;
  is_closed: boolean;
  min_stay: number | null;
};

export type InventoryUpsert = {
  room_id: string;
  date: IsoDate;
  units: number | null;
  is_closed: boolean;
  min_stay: number | null;
};

export type RateUpsert = { rate_plan_id: string; date: IsoDate; price_paise: number };

export type CalendarEditPlan = {
  dates: IsoDate[];
  inventory: InventoryUpsert[];
  rates: RateUpsert[];
  /** Delete the plan's overrides on these dates. */
  clearRates: { rate_plan_id: string; dates: IsoDate[] } | null;
};

/** Every date in [start, end], keeping only the given ISO weekdays (none = all). */
export function expandEditDates(start: IsoDate, end: IsoDate, weekdays: readonly number[]): IsoDate[] {
  const days = new Set(weekdays);
  return dateRange(start, end).filter((d) => days.size === 0 || days.has(isoWeekday(d)));
}

export function changesInventory(edit: Pick<CalendarEdit, "availability" | "units" | "min_stay">): boolean {
  return edit.availability !== "keep" || edit.units !== null || edit.min_stay !== null;
}

export function planCalendarEdit(
  edit: CalendarEdit,
  existing: readonly ExistingInventory[],
): CalendarEditPlan {
  const dates = expandEditDates(edit.start, edit.end, edit.weekdays);
  const byDate = new Map(existing.map((row) => [row.date, row]));

  const inventory: InventoryUpsert[] = changesInventory(edit)
    ? dates.map((date) => {
        const current = byDate.get(date);
        return {
          room_id: edit.room_id,
          date,
          units: edit.units ?? current?.units ?? null,
          is_closed:
            edit.availability === "keep" ? (current?.is_closed ?? false) : edit.availability === "close",
          min_stay: edit.min_stay ?? current?.min_stay ?? null,
        };
      })
    : [];

  // "Clear override" wins over a typed price; the form only sends one of them.
  const { rate_plan_id: planId, price } = edit;
  const clearRates = planId && edit.clear_price && dates.length ? { rate_plan_id: planId, dates } : null;
  const rates: RateUpsert[] =
    planId && !edit.clear_price && price !== null
      ? dates.map((date) => ({ rate_plan_id: planId, date, price_paise: price }))
      : [];

  return { dates, inventory, rates, clearRates };
}
