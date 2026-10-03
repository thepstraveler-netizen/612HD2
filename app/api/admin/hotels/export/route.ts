import { NextResponse } from "next/server";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { getHotelExportRows } from "@/lib/hotels/admin";
import { hotelsToCsv } from "@/lib/hotels/csv";
import { todayInIndia } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** CSV of every hotel's rooms and rate plans (one row per plan) for staff with hotels.read. */
export async function GET() {
  // assertPermission also enforces two-step sign-in (mfaSatisfied).
  try {
    await assertPermission("hotels.read");
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw error;
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
