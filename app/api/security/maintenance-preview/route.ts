import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { localizedPath, splitLocale } from "@/lib/routing/protected";
import { isStaff, MAINTENANCE_PREVIEW_PATH } from "@/lib/security/maintenance";
import { safeNextPath } from "@/lib/utils";

/**
 * Staff preview of the public site while maintenance mode is on (D-099).
 * Staff are sent here from the maintenance page; signed-out visitors go to
 * the login page first. Staff get Next's draft mode, so public pages render
 * per request and the public layout can confirm their session. Anyone else
 * just lands back on the page they came from. `?exit=1` leaves the preview.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/");
  const target = new URL(next, request.nextUrl.origin);
  const draft = await draftMode();

  if (request.nextUrl.searchParams.get("exit")) {
    draft.disable();
    return NextResponse.redirect(target);
  }

  const session = await getSession();
  if (!session) {
    const { locale } = splitLocale(next);
    const back = `${MAINTENANCE_PREVIEW_PATH}?next=${encodeURIComponent(next)}`;
    const login = new URL(localizedPath(locale, "/login"), request.nextUrl.origin);
    login.searchParams.set("next", back);
    return NextResponse.redirect(login);
  }
  if (!session.profile?.is_blocked && isStaff(session.permissions)) draft.enable();
  return NextResponse.redirect(target);
}
