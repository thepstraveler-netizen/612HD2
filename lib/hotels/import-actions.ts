"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { MAX_IMPORT_BYTES, parseHotelImport, type HotelImportIssue } from "./csv-import";

/** Admin → Hotels → Import CSV (D-106): check a file, then apply it (hotels.write). */

const csvInput = z.string().max(MAX_IMPORT_BYTES);

export type HotelImportPreview =
  | { ok: true; rows: number; newHotels: string[]; existingHotels: string[]; plans: number }
  | { ok: false; error: string; issues?: HotelImportIssue[] };

export type HotelImportResult =
  | {
      ok: true;
      hotelsCreated: number;
      hotelsUpdated: number;
      roomsCreated: number;
      roomsUpdated: number;
      plansCreated: number;
      plansUpdated: number;
    }
  | { ok: false; error: string; issues?: HotelImportIssue[] };

async function authorize(): Promise<string | null> {
  try {
    await assertPermission("hotels.write");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) return "forbidden";
    throw error;
  }
}

export async function previewHotelImport(input: unknown): Promise<HotelImportPreview> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };
  const csv = csvInput.safeParse(input);
  if (!csv.success) return { ok: false, error: "fileTooLarge" };
  const { rows, issues } = parseHotelImport(csv.data);
  if (issues.length) return { ok: false, error: "invalidFile", issues };

  const slugs = [...new Set(rows.map((r) => r.hotel_slug))];
  const supabase = await createClient();
  const { data, error } = await supabase.from("hotels").select("slug").in("slug", slugs);
  if (error) {
    console.error("[hotels import] preview read failed", error);
    return { ok: false, error: "saveFailed" };
  }
  const existing = new Set(data.map((h) => h.slug));
  return {
    ok: true,
    rows: rows.length,
    newHotels: slugs.filter((s) => !existing.has(s)),
    existingHotels: slugs.filter((s) => existing.has(s)),
    plans: rows.filter((r) => r.rate_plan).length,
  };
}

/** `unknown_city:7:mathura` → an issue on line 7. */
function sqlIssue(message: string): HotelImportIssue | null {
  const match = /^(unknown_city|deleted_hotel):(\d+):(.*)$/.exec(message);
  if (!match) return null;
  const [, code, line, value] = match;
  return {
    line: Number(line),
    column: code === "unknown_city" ? "city" : "hotel_slug",
    message: code === "unknown_city" ? `unknownCity:${value}` : `deletedHotel:${value}`,
  };
}

export async function applyHotelImport(input: unknown): Promise<HotelImportResult> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };
  const csv = csvInput.safeParse(input);
  if (!csv.success) return { ok: false, error: "fileTooLarge" };
  const { rows, issues } = parseHotelImport(csv.data);
  if (issues.length) return { ok: false, error: "invalidFile", issues };

  // One call = one transaction: a failing row leaves the catalog untouched.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_hotels", { p_rows: rows });
  if (error) {
    const issue = sqlIssue(error.message);
    if (issue) return { ok: false, error: "invalidFile", issues: [issue] };
    console.error("[hotels import] failed", error);
    return { ok: false, error: error.code === "42501" ? "forbidden" : "saveFailed" };
  }
  const counts = z
    .object({
      hotels_created: z.number(),
      hotels_updated: z.number(),
      rooms_created: z.number(),
      rooms_updated: z.number(),
      plans_created: z.number(),
      plans_updated: z.number(),
    })
    .parse(data);
  revalidateTag(CATALOG_TAG);
  revalidatePath("/[locale]/admin", "layout");
  return {
    ok: true,
    hotelsCreated: counts.hotels_created,
    hotelsUpdated: counts.hotels_updated,
    roomsCreated: counts.rooms_created,
    roomsUpdated: counts.rooms_updated,
    plansCreated: counts.plans_created,
    plansUpdated: counts.plans_updated,
  };
}
