import { routing } from "@/i18n/routing";

/** Path prefixes that need a signed-in user. Role checks happen in each layout. */
export const PROTECTED_PREFIXES = ["/account", "/admin", "/vendor", "/driver"] as const;

/** Public pages under a protected prefix: a driver's trip or ride link works without a login. */
export const PUBLIC_EXCEPTIONS = ["/driver/trip", "/driver/ride"] as const;

/** Pages a signed-in user should be bounced away from. */
export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"] as const;

/** Splits `/hi/admin/hotels` into `{ locale: "hi", path: "/admin/hotels" }`. */
export function splitLocale(pathname: string): { locale: string; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first)) {
    return { locale: first, path: `/${rest.join("/")}`.replace(/\/$/, "") || "/" };
  }
  return { locale: routing.defaultLocale, path: pathname.replace(/\/$/, "") || "/" };
}

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isProtectedPath(path: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((prefix) => matches(path, prefix))) return false;
  return PROTECTED_PREFIXES.some((prefix) => matches(path, prefix));
}

export function isGuestOnlyPath(path: string): boolean {
  return GUEST_ONLY_PATHS.some((prefix) => matches(path, prefix));
}

/** Rebuilds a locale-aware URL path (`en` is unprefixed). */
export function localizedPath(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}
