import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { todayInIndia } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions/check";
import { getVendorLedger, toStatementRows } from "@/lib/settlements/admin-queries";
import { fileSafe } from "@/lib/settlements/admin-rows";
import { statementCsv } from "@/lib/settlements/statement";
import { ledgerFiltersSchema } from "@/schemas/vendor-admin";

export const dynamic = "force-dynamic";

/** One vendor's ledger statement as CSV (same filters as the page) for staff with payments.read. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile?.is_blocked || !hasPermission(session.permissions, "payments.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
