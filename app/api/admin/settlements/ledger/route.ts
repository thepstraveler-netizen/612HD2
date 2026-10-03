import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { getVendorLedger, toStatementRows } from "@/lib/settlements/admin-queries";
import { fileSafe } from "@/lib/settlements/admin-rows";
import { statementCsv } from "@/lib/settlements/statement";
import { ledgerFiltersSchema } from "@/schemas/vendor-admin";

export const dynamic = "force-dynamic";

/** One vendor's ledger statement as CSV (same filters as the page) for staff with payments.read. */
export async function GET(request: NextRequest) {
  // assertPermission also enforces two-step sign-in (mfaSatisfied).
  try {
    await assertPermission("payments.read");
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw error;
  }
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const vendor = z.uuid().safeParse(params.vendor);
  if (!vendor.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const ledger = await getVendorLedger(vendor.data, ledgerFiltersSchema.parse(params));
  if (!ledger) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const csv = statementCsv(toStatementRows(ledger.rows));
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-${fileSafe(ledger.vendor.name)}-${todayInIndia()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
