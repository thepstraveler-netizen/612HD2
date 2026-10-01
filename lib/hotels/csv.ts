import { paiseToRupeesInput } from "@/lib/money";

/**
 * RFC 4180 CSV for admin exports. Cells that a spreadsheet would run as a
 * formula (leading = + - @, or tab / carriage return) get a leading single
 * quote so an export can never execute anything when opened.
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  // Plain numbers (including negatives) are data, not formulas.
  if (typeof value !== "number" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus data rows, CRLF-separated with a trailing CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type HotelExportRow = {
  hotelSlug: string;
  hotelName: string;
  status: string;
  citySlug: string;
  propertyType: string;
  stars: number;
  roomName: string;
  units: number;
  planName: string;
  mealPlan: string;
  basePricePaise: number;
  extraAdultPaise: number;
  extraChildPaise: number;
  refundable: boolean;
};

export const HOTEL_EXPORT_HEADER = [
  "hotel_slug",
  "hotel_name",
  "status",
  "city",
  "property_type",
  "stars",
  "room",
  "units",
  "rate_plan",
  "meal_plan",
  "base_price_inr",
  "extra_adult_inr",
  "extra_child_inr",
  "refundable",
] as const;

export function hotelsToCsv(rows: readonly HotelExportRow[]): string {
  return toCsv(
    HOTEL_EXPORT_HEADER,
    rows.map((r) => [
      r.hotelSlug,
      r.hotelName,
      r.status,
      r.citySlug,
      r.propertyType,
      r.stars,
      r.roomName,
      r.units,
      r.planName,
      r.mealPlan,
      paiseToRupeesInput(r.basePricePaise),
      paiseToRupeesInput(r.extraAdultPaise),
      paiseToRupeesInput(r.extraChildPaise),
      r.refundable,
    ]),
  );
}
