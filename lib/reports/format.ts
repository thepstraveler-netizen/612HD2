/** Number formatting for the admin dashboard and reports (safe in client components). */

/** 8000 basis points → "80%", 1250 → "12.5%". */
export function formatBps(bps: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(bps / 10_000);
}

/** Compact rupees for chart axes: 150000000 paise → "₹15L". */
export function compactRupees(paise: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(paise / 100);
}

/** "2026-09-02" → "2 Sep" (a calendar date, so formatted in UTC to avoid shifting). */
export function formatDayShort(day: string, locale = "en"): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
