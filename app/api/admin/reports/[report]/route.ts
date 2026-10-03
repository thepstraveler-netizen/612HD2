import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { todayInIndia } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions/check";
import { getReport } from "@/lib/reports/queries";
import { parseReportRange } from "@/lib/reports/range";
import { reportCsv, reportFilename } from "@/lib/reports/rows";
import { REPORT_KEYS, type ReportKey } from "@/schemas/engagement-admin";

export const dynamic = "force-dynamic";

/** One admin report for a date range as CSV, for staff with reports.read. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  if (!(REPORT_KEYS as readonly string[]).includes(report)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const session = await getSession();
  if (!session || session.profile?.is_blocked || !hasPermission(session.permissions, "reports.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const key = report as ReportKey;
  const range = parseReportRange(Object.fromEntries(request.nextUrl.searchParams), todayInIndia());
  const rows = await getReport(key, range.from, range.to);
  const csv = reportCsv(key, rows);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFilename(key, range.from, range.to)}"`,
      "Cache-Control": "no-store",
    },
  });
}
