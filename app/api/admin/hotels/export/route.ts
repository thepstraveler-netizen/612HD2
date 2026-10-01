import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getHotelExportRows } from "@/lib/hotels/admin";
import { hotelsToCsv } from "@/lib/hotels/csv";
import { todayInIndia } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions/check";

export const dynamic = "force-dynamic";

/** CSV of every hotel's rooms and rate plans (one row per plan) for staff with hotels.read. */
export async function GET() {
  const session = await getSession();
  if (!session || session.profile?.is_blocked || !hasPermission(session.permissions, "hotels.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const csv = hotelsToCsv(await getHotelExportRows());
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hotels-${todayInIndia()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
