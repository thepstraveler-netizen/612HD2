import { routing } from "@/i18n/routing";
import { localizedPath } from "@/lib/routing/protected";

/**
 * Absolute site origin for canonical URLs, sitemaps and JSON-LD. Read
 * straight from the env (not publicEnv()) so builds without Supabase keys
 * still render metadata.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Absolute URL for a locale-less path (`/hotels/x`) in `locale` (en unprefixed). */
export function absoluteUrl(path: string, locale: string = routing.defaultLocale): string {
  return `${siteUrl()}${localizedPath(locale, normalizePath(path))}`;
}

/** `hotels/x/` → `/hotels/x`; `""` → `/`. */
export function normalizePath(path: string): string {
  const clean = `/${path.replace(/^\/+/, "")}`.replace(/\/+$/, "");
  return clean || "/";
}

/** hreflang map for a locale-less path: every locale plus `x-default` (English). */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) languages[locale] = absoluteUrl(path, locale);
  languages["x-default"] = absoluteUrl(path, routing.defaultLocale);
  return languages;
}

const SITE_NAMES: Record<string, string> = {
  en: "The P & S Traveler Group",
  hi: "द पी एंड एस ट्रैवलर ग्रुप",
};

/** Brand name for `og:site_name` (matches messages `brand.name`). */
export function siteName(locale: string): string {
  return SITE_NAMES[locale] ?? SITE_NAMES.en;
}

/** Default branded 1200×630 Open Graph image (app/og/default.png). */
export function defaultOgImage(): string {
  return `${siteUrl()}/og/default.png`;
}

/** Brand logo used in JSON-LD (the 512px PWA icon). */
export function logoUrl(): string {
  return `${siteUrl()}/icons/icon-512.png`;
}

/** Generated share card for a hotel or package (app/og/<kind>/[file]/route.tsx). */
export function ogImageUrl(kind: "hotel" | "package", slug: string): string {
  return `${siteUrl()}/og/${kind}/${encodeURIComponent(slug)}.png`;
}
