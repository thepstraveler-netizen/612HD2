import type { Metadata } from "next";
import { absoluteUrl, defaultOgImage, languageAlternates, normalizePath, siteName } from "./site";

export type PageMetadataInput = {
  locale: string;
  /** Locale-less path, e.g. `/hotels/radha-residency`. */
  path: string;
  title?: string;
  description?: string;
  /** Absolute image URLs; omitted or empty = the default branded OG image. */
  images?: string[];
  type?: "website" | "article";
  noIndex?: boolean;
};

/**
 * Metadata for a public page: canonical URL for the current locale, hreflang
 * alternates (en, hi, x-default) and Open Graph / Twitter basics. Next.js
 * merges metadata shallowly, so `openGraph` here replaces the layout's and
 * repeats the site-wide fields.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const path = normalizePath(input.path);
  const url = absoluteUrl(path, input.locale);
  const ogLocale = input.locale === "hi" ? "hi_IN" : "en_IN";
  const custom = input.images?.filter(Boolean);
  const images = custom?.length ? custom : [defaultOgImage()];
  return {
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: input.type ?? "website",
      siteName: siteName(input.locale),
      url,
      locale: ogLocale,
      alternateLocale: ogLocale === "hi_IN" ? ["en_IN"] : ["hi_IN"],
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      images,
    },
    twitter: {
      card: "summary_large_image",
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      images,
    },
    ...(input.noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
