import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { HOTEL_EXPORT_HEADER } from "./csv";

/**
 * Hotel CSV import (D-106). Reads the same columns the export writes, so a
 * team can export, edit prices or rooms in a spreadsheet, and import the file
 * back. Each row is one rate plan of one room; a row with no room only
 * creates or updates the hotel. Nothing is ever deleted by an import.
 */

export const MAX_IMPORT_ROWS = 2000;
// Under the 1 MB server action body limit, leaving room for multi-byte text.
export const MAX_IMPORT_BYTES = 800_000;

/** RFC 4180 parser: quoted cells, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Blank lines (often a trailing one) carry nothing.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Undo the export's formula guard: `'=x` back to `=x`. */
function unguard(cell: string): string {
  const trimmed = cell.trim();
  return /^'[=+\-@\t\r]/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const rupees = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const paise = rupeesToPaise(v);
      if (paise === null || paise > 100_000_000) {
        ctx.addIssue({ code: "custom", message: "invalidAmount" });
        return z.NEVER;
      }
      return paise;
    }),
);

const yesNo = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return true;
      const text = v.toLowerCase();
      if (["yes", "y", "true", "1"].includes(text)) return true;
      if (["no", "n", "false", "0"].includes(text)) return false;
      ctx.addIssue({ code: "custom", message: "invalidYesNo" });
      return z.NEVER;
    }),
);

const whole = (max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(max).optional());

export const hotelImportRowSchema = z
  .object({
    hotel_slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "invalidSlug")
      .max(120),
    hotel_name: z.string().min(1, "required").max(200),
    status: z.preprocess(blankToUndefined, z.enum(["draft", "published", "archived"]).default("draft")),
    city: z.string().regex(/^[a-z0-9-]+$/, "invalidCity"),
    property_type: z.preprocess(
      blankToUndefined,
      z
        .enum(["hotel", "guest_house", "dharamshala", "ashram", "homestay", "resort", "apartment", "hostel"])
        .default("hotel"),
    ),
    stars: whole(5).transform((v) => v ?? 0),
    room: z.preprocess(blankToUndefined, z.string().max(120).optional()),
    units: whole(999),
    rate_plan: z.preprocess(blankToUndefined, z.string().max(120).optional()),
    meal_plan: z.preprocess(
      blankToUndefined,
      z.enum(["room_only", "breakfast", "half_board", "full_board"]).default("room_only"),
    ),
    base_price_inr: rupees,
    extra_adult_inr: rupees,
    extra_child_inr: rupees,
    refundable: yesNo,
  })
  .superRefine((row, ctx) => {
    if (!row.room) {
      if (row.rate_plan) ctx.addIssue({ code: "custom", path: ["room"], message: "required" });
      return;
    }
    if (!row.rate_plan) ctx.addIssue({ code: "custom", path: ["rate_plan"], message: "required" });
    if (row.units === undefined) ctx.addIssue({ code: "custom", path: ["units"], message: "required" });
    if (row.base_price_inr === undefined)
      ctx.addIssue({ code: "custom", path: ["base_price_inr"], message: "required" });
  });

/** One row as the import_hotels SQL function takes it (money in paise). */
export type HotelImportRow = {
  line: number;
  hotel_slug: string;
  hotel_name: string;
  status: "draft" | "published" | "archived";
  city: string;
  property_type: string;
  stars: number;
  room: string | null;
  units: number | null;
  rate_plan: string | null;
  meal_plan: string;
  base_price_paise: number | null;
  extra_adult_paise: number;
  extra_child_paise: number;
  refundable: boolean;
};

export type HotelImportIssue = { line: number; column?: string; message: string };

export type ParsedHotelImport = { rows: HotelImportRow[]; issues: HotelImportIssue[] };

const HOTEL_FIELDS = ["hotel_name", "status", "city", "property_type", "stars"] as const;

/**
 * Parses and checks a hotel CSV. Line numbers count the header as line 1, as
 * a spreadsheet shows them. Any issue blocks the whole import.
 */
export function parseHotelImport(text: string): ParsedHotelImport {
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], issues: [{ line: 0, message: "fileTooLarge" }] };
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], issues: [{ line: 0, message: "emptyFile" }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const known = new Set<string>(HOTEL_EXPORT_HEADER);
  const issues: HotelImportIssue[] = [];
  for (const name of header) {
    if (!known.has(name)) issues.push({ line: 1, column: name, message: "unknownColumn" });
  }
  for (const name of ["hotel_slug", "hotel_name", "city"]) {
    if (!header.includes(name)) issues.push({ line: 1, column: name, message: "missingColumn" });
  }
  if (new Set(header).size !== header.length) issues.push({ line: 1, message: "duplicateColumn" });
  if (issues.length) return { rows: [], issues };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], issues: [{ line: 0, message: "tooManyRows" }] };

  const rows: HotelImportRow[] = [];
  const firstForHotel = new Map<string, HotelImportRow>();
  const seenPlans = new Map<string, number>();
  const roomUnits = new Map<string, number | null>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const record = Object.fromEntries(header.map((name, i) => [name, unguard(cells[i] ?? "")]));
    const parsed = hotelImportRowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        issues.push({ line, column: issue.path.join(".") || undefined, message: issue.message });
      return;
    }
    const r = parsed.data;
    const row: HotelImportRow = {
      line,
      hotel_slug: r.hotel_slug,
      hotel_name: r.hotel_name,
      status: r.status,
      city: r.city,
      property_type: r.property_type,
      stars: r.stars,
      room: r.room ?? null,
      units: r.room ? (r.units ?? null) : null,
      rate_plan: r.rate_plan ?? null,
      meal_plan: r.meal_plan,
      base_price_paise: r.room ? (r.base_price_inr ?? null) : null,
      extra_adult_paise: r.extra_adult_inr ?? 0,
      extra_child_paise: r.extra_child_inr ?? 0,
      refundable: r.refundable,
    };
    const first = firstForHotel.get(row.hotel_slug);
    if (first) {
      const differs = HOTEL_FIELDS.find((f) => first[f] !== row[f]);
      if (differs) {
        issues.push({ line, column: differs, message: "hotelDetailsDiffer" });
        return;
      }
    } else firstForHotel.set(row.hotel_slug, row);
    if (row.room) {
      const roomKey = [row.hotel_slug, row.room.toLowerCase()].join("\u0000");
      const units = roomUnits.get(roomKey);
      if (units !== undefined && units !== row.units) {
        issues.push({ line, column: "units", message: "roomDetailsDiffer" });
        return;
      }
      roomUnits.set(roomKey, row.units);
    }
    if (row.room && row.rate_plan) {
      const key = [row.hotel_slug, row.room.toLowerCase(), row.rate_plan.toLowerCase()].join("\u0000");
      if (seenPlans.has(key)) {
        issues.push({ line, column: "rate_plan", message: "duplicatePlan" });
        return;
      }
      seenPlans.set(key, line);
    }
    rows.push(row);
  });
  return { rows, issues };
}
