import { indiaMinutes, indiaWeekday } from "@/lib/cabs/time";
import type { StoreHours } from "@/schemas/delivery";

/**
 * Store opening hours, read in India time. A store is orderable when it is
 * active, accepting orders (not paused) and open now (24×7 or inside one of
 * today's slots, or a slot from yesterday that runs past midnight).
 */

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type HoursLike = { is24x7: boolean; hours: StoreHours; acceptingOrders: boolean };

export function isOpenAt(store: Pick<HoursLike, "is24x7" | "hours">, at: Date): boolean {
  if (store.is24x7) return true;
  const day = indiaWeekday(at);
  const yesterday = day === 1 ? 7 : day - 1;
  const t = indiaMinutes(at);
  return store.hours.some((slot) => {
    const open = toMinutes(slot.open);
    const close = toMinutes(slot.close);
    if (open === close) return false;
    if (open < close) return slot.day === day && t >= open && t < close;
    // Overnight slot, e.g. 18:00–02:00: the evening part today, the early part tomorrow.
    return (slot.day === day && t >= open) || (slot.day === yesterday && t < close);
  });
}

export function canOrderNow(store: HoursLike, at: Date): boolean {
  return store.acceptingOrders && isOpenAt(store, at);
}

/** The next time the store opens within a week ("HH:MM" and whether it's today), or null if it never does. */
export function nextOpening(
  store: Pick<HoursLike, "is24x7" | "hours">,
  at: Date,
): { day: number; time: string; today: boolean } | null {
  if (store.is24x7 || store.hours.length === 0) return null;
  const today = indiaWeekday(at);
  const now = indiaMinutes(at);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = ((today - 1 + offset) % 7) + 1;
    const slots = store.hours
      .filter((s) => s.day === day && s.open !== s.close)
      .map((s) => s.open)
      .sort();
    const next = slots.find((open) => offset > 0 || toMinutes(open) > now);
    if (next) return { day, time: next, today: offset === 0 };
  }
  return null;
}
