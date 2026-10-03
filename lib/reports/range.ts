import { addDays, daysBetween, type IsoDate } from "@/lib/dates";
import { reportRangeQuerySchema, type RangePreset } from "@/schemas/engagement-admin";

/**
 * Date ranges for the admin dashboard and reports: a preset (last 7 / 30 /
 * 90 days, ending today in India) or a custom from–to, kept in the URL.
 * Custom ranges are put in order and capped at {@link MAX_RANGE_DAYS}.
 */

export type ReportRange = { preset: RangePreset; from: IsoDate; to: IsoDate; days: number };

export const DEFAULT_PRESET: Exclude<RangePreset, "custom"> = "30";
export const MAX_RANGE_DAYS = 366;

function flatten(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out;
}

export function presetRange(preset: Exclude<RangePreset, "custom">, today: IsoDate): ReportRange {
  const days = Number(preset);
  return { preset, from: addDays(today, -(days - 1)), to: today, days };
}

export function parseReportRange(
  raw: Record<string, string | string[] | undefined>,
  today: IsoDate,
): ReportRange {
  const q = reportRangeQuerySchema.parse(flatten(raw));
  const preset = q.range ?? (q.from || q.to ? "custom" : DEFAULT_PRESET);
  if (preset !== "custom") return presetRange(preset, today);
  let from = q.from ?? q.to;
  let to = q.to ?? q.from;
  if (!from || !to) return presetRange(DEFAULT_PRESET, today);
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { preset: "custom", from, to, days: daysBetween(from, to) + 1 };
}

/** The range as a query string (no leading `?`). */
export function rangeQuery(range: Pick<ReportRange, "preset" | "from" | "to">): string {
  if (range.preset !== "custom") return `range=${range.preset}`;
  return new URLSearchParams({ range: "custom", from: range.from, to: range.to }).toString();
}
