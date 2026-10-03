import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { parseRefCode, REF_COOKIE, REF_COOKIE_MAX_AGE, REF_PARAM } from "@/lib/referrals/link";
import { isGuestOnlyPath, isProtectedPath, localizedPath, splitLocale } from "@/lib/routing/protected";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * 1. next-intl resolves the locale (en at `/`, hi at `/hi`).
 * 2. Supabase refreshes the session cookie on that same response.
 * 3. Protected areas require a user; fine-grained permission checks run
 *    server-side in each layout via requirePermission().
 * 4. A `?ref=CODE` referral link is kept in a first-party cookie until the
 *    visitor signs in and the account area claims it (D-086).
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const refCode = parseRefCode(request.nextUrl.searchParams.get(REF_PARAM));
  if (refCode) {
    response.cookies.set(REF_COOKIE, refCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REF_COOKIE_MAX_AGE,
      path: "/",
    });
  }

  // next-intl issued a locale redirect/rewrite target; let it through as-is.
  if (response.headers.get("location")) return response;

  const { user } = await updateSession(request, response);
  const { locale, path } = splitLocale(request.nextUrl.pathname);

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    const [pathname, search = ""] = target.split("?");
    url.pathname = pathname;
    url.search = search ? `?${search}` : "";
    const redirect = NextResponse.redirect(url);
    // Carry refreshed auth cookies across the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && isProtectedPath(path)) {
    const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return redirectTo(`${localizedPath(locale, "/login")}?next=${next}`);
  }

  if (user && isGuestOnlyPath(path)) {
    return redirectTo(localizedPath(locale, "/account"));
  }

  return response;
}

export const config = {
  // Skip API routes, auth callbacks, Next internals and static files.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
