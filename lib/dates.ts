/**
 * Calendar dates as ISO strings (`YYYY-MM-DD`). Stays are counted in nights
 * on the property's local calendar (India, UTC+5:30), so dates never carry a
 * time or zone; all arithmetic runs in UTC to avoid DST/zone drift.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** The nights of a stay: every date from check-in up to, not including, check-out. */
export function stayNights(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  const count = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(checkIn, i));
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Today's date in India. */
export function todayInIndia(now: Date = new Date()): IsoDate {
  return fromUtc(now.getTime() + IST_OFFSET_MS);
}

/** Every date in [start, end] inclusive. */
export function dateRange(start: IsoDate, end: IsoDate): IsoDate[] {
  return stayNights(start, addDays(end, 1));
}
