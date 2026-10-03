import type { MetadataRoute } from "next";
import { loadSitemapSources } from "@/lib/seo/queries";
import { buildSitemap, STATIC_SITEMAP_SOURCES } from "@/lib/seo/sitemap";

/** Regenerated at most hourly; works without Supabase (static pages + built-in services). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let dynamic: Awaited<ReturnType<typeof loadSitemapSources>> = [];
  try {
    dynamic = await loadSitemapSources();
  } catch (error) {
    console.error("[seo] sitemap:", error);
  }
  return buildSitemap([...STATIC_SITEMAP_SOURCES, ...dynamic]);
}
