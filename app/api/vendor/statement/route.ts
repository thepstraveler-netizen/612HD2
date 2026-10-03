import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { getVendorEarnings } from "@/lib/partners/vendor-queries";
import { statementCsv } from "@/lib/settlements/statement";
import { createClient } from "@/lib/supabase/server";

/**
 * A vendor's settlement statement as CSV (`?v=<vendor id>`). Needs
 * `vendor.portal` and membership of that vendor; the ledger itself is read
 * under RLS, which checks membership again.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ v: z.uuid() });

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = (await assertPermission("vendor.portal")).user.id;
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw error;
  }
  const parsed = querySchema.safeParse({ v: request.nextUrl.searchParams.get("v") });
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const vendorId = parsed.data.v;

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("vendor_members")
    .select("vendor_id")
    .eq("vendor_id", vendorId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { ledger } = await getVendorEarnings(vendorId);
  const today = new Date().toISOString().slice(0, 10);
  // BOM so spreadsheet apps read the file as UTF-8.
  return new NextResponse(`﻿${statementCsv(ledger)}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="statement-${today}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
