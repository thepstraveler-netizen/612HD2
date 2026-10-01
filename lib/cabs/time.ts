import { daysBetween, isoWeekday, type IsoDate } from "@/lib/dates";

/**
 * Cab times are typed and shown in India time (UTC+5:30, no DST) and
 * stored as instants. These helpers convert between the two without
 * relying on the server's time zone.
 */

const IST_OFFSET_MS = 330 * 60_000;

/** "2026-12-10T05:30" (India time, as a datetime-local input gives it) → instant. */
export function fromIndiaLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+05:30`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject overflowed values such as 2026-02-30T10:00.
  return toIndiaLocal(d) === value ? d : null;
}

/** Instant → "YYYY-MM-DDTHH:MM" in India time. */
export function toIndiaLocal(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

export function indiaDate(at: Date): IsoDate {
  return toIndiaLocal(at).slice(0, 10);
}

/** Minutes since midnight, India time. */
export function indiaMinutes(at: Date): number {
  const [h, m] = toIndiaLocal(at).slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

export function indiaWeekday(at: Date): number {
  return isoWeekday(indiaDate(at));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Whether `at` falls in the night window, e.g. 22:00–06:00 (may wrap past midnight). */
export function isNightTime(at: Date, start: string, end: string): boolean {
  const t = indiaMinutes(at);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Calendar days a round trip spans in India, counting both the pickup and the return day. */
export function tripDays(pickupAt: Date, returnAt: Date | null): number {
  if (!returnAt) return 1;
  return Math.max(1, daysBetween(indiaDate(pickupAt), indiaDate(returnAt)) + 1);
}
