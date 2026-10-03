import { NextResponse } from "next/server";
import { BUILD_ID } from "@/lib/pwa/build";

/** The deployment now serving the site, for the stale-tab guard (D-105). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ build: BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
