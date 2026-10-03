import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { getCommissionReport } from "@/lib/settlements/admin-queries";
import { commissionReportCsv, defaultReportRange } from "@/lib/settlements/admin-rows";
import { reportRangeSchema } from "@/schemas/vendor-admin";

export const dynamic = "force-dynamic";

/** Commission report (per vendor, ledger rows dated in a range) as CSV for staff with payments.read. */
export async function GET(request: NextRequest) {
  // assertPermission also enforces two-step sign-in (mfaSatisfied).
  try {
    await assertPermission("payments.read");
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw error;
  }
  const parsed = reportRangeSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const fallback = defaultReportRange(todayInIndia());
  let from = parsed.from ?? fallback.from;
  let to = parsed.to ?? fallback.to;
  if (from > to) [from, to] = [to, from];
  const csv = commissionReportCsv(await getCommissionReport(from, to));
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commission-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
