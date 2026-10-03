import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SERVICES } from "@/lib/services";
import { absoluteUrl, languageAlternates, normalizePath } from "./site";

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type SitemapSource = {
  /** Locale-less path, e.g. `/hotels/radha-residency`. */
  path: string;
  lastModified?: string | Date | null;
  changeFrequency?: ChangeFrequency;
  priority?: number;
};

/** Public index pages; always listed, even without a database. */
export const STATIC_SITEMAP_SOURCES: readonly SitemapSource[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/hotels", changeFrequency: "daily", priority: 0.9 },
  { path: "/cabs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/rides", changeFrequency: "weekly", priority: 0.8 },
  { path: "/packages", changeFrequency: "weekly", priority: 0.9 },
  { path: "/travel", changeFrequency: "monthly", priority: 0.7 },
  { path: "/food", changeFrequency: "daily", priority: 0.8 },
  { path: "/essentials", changeFrequency: "daily", priority: 0.8 },
  { path: "/medicine", changeFrequency: "monthly", priority: 0.7 },
  { path: "/services", changeFrequency: "weekly", priority: 0.7 },
  { path: "/partner", changeFrequency: "monthly", priority: 0.6 },
];

/** Service landing pages from the built-in list (used when the DB is unavailable). */
export const FALLBACK_SERVICE_SOURCES: readonly SitemapSource[] = SERVICES.map((s) => ({
  path: `/services/${s.slug}`,
  changeFrequency: "monthly",
  priority: 0.6,
}));

function toDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * One `<url>` per path per locale, each carrying the hreflang alternates for
 * every locale plus x-default. Duplicate paths are dropped (first wins).
 */
export function buildSitemap(sources: readonly SitemapSource[]): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  const out: MetadataRoute.Sitemap = [];
  for (const source of sources) {
    const path = normalizePath(source.path);
    if (seen.has(path)) continue;
    seen.add(path);
    const languages = languageAlternates(path);
    const lastModified = toDate(source.lastModified);
    for (const locale of routing.locales) {
      out.push({
        url: absoluteUrl(path, locale),
        ...(lastModified ? { lastModified } : {}),
        ...(source.changeFrequency ? { changeFrequency: source.changeFrequency } : {}),
        ...(source.priority !== undefined ? { priority: source.priority } : {}),
        alternates: { languages },
      });
    }
  }
  return out;
}
