import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { SHOP_CONFIG } from "@/lib/delivery/ui";
import { createPublicClient } from "@/lib/supabase/public";
import { FALLBACK_SERVICE_SOURCES, type SitemapSource } from "./sitemap";

/**
 * Lightweight public reads for the sitemap and structured data. Each query
 * fails soft: a missing Supabase config or a DB error leaves that group out
 * (services fall back to the built-in list) so the build never breaks.
 */

const STORE_PATHS: Record<string, string> = {
  [SHOP_CONFIG.food.kind]: SHOP_CONFIG.food.path,
  [SHOP_CONFIG.essentials.kind]: SHOP_CONFIG.essentials.path,
};

type Row = { slug: string; updated_at: string | null };

function log(scope: string, error: unknown) {
  console.error(`[seo] ${scope}:`, error instanceof Error ? error.message : error);
}

export async function loadSitemapSources(): Promise<SitemapSource[]> {
  const supabase = createPublicClient();
  if (!supabase) return [...FALLBACK_SERVICE_SOURCES];

  const safe = async <T>(scope: string, run: () => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    try {
      const { data, error } = await run();
      if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
      return data ?? [];
    } catch (error) {
      log(scope, error);
      return null;
    }
  };

  const [services, hotels, packages, stores] = await Promise.all([
    safe<Row>("services", () =>
      supabase.from("services").select("slug, updated_at").eq("is_published", true).is("deleted_at", null),
    ),
    safe<Row>("hotels", () =>
      supabase.from("hotels").select("slug, updated_at").eq("status", "published").is("deleted_at", null),
    ),
    safe<Row>("packages", () =>
      supabase.from("packages").select("slug, updated_at").eq("is_active", true).is("deleted_at", null),
    ),
    safe<Row & { kind: string }>("stores", () =>
      supabase.from("stores").select("slug, kind, updated_at").eq("is_active", true).is("deleted_at", null),
    ),
  ]);

  const out: SitemapSource[] = [];
  if (services === null) out.push(...FALLBACK_SERVICE_SOURCES);
  else
    for (const s of services)
      out.push({
        path: `/services/${s.slug}`,
        lastModified: s.updated_at,
        changeFrequency: "monthly",
        priority: 0.6,
      });
  for (const h of hotels ?? [])
    out.push({
      path: `/hotels/${h.slug}`,
      lastModified: h.updated_at,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  for (const p of packages ?? [])
    out.push({
      path: `/packages/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  for (const s of stores ?? []) {
    const base = STORE_PATHS[s.kind];
    if (base)
      out.push({
        path: `${base}/${s.slug}`,
        lastModified: s.updated_at,
        changeFrequency: "weekly",
        priority: 0.6,
      });
  }
  return out;
}

export type RatingSummary = { rating: number | null; count: number };

/**
 * Denormalised rating for a package or store (kept in sync by the reviews
 * triggers), for `aggregateRating`. Cached with the catalog.
 */
export const getRatingSummary = unstable_cache(
  async (table: "packages" | "stores", id: string): Promise<RatingSummary> => {
    const supabase = createPublicClient();
    if (!supabase) return { rating: null, count: 0 };
    try {
      const { data, error } = await supabase
        .from(table)
        .select("rating, rating_count")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return { rating: null, count: 0 };
      return { rating: data.rating === null ? null : Number(data.rating), count: data.rating_count ?? 0 };
    } catch (error) {
      log(`rating ${table}`, error);
      return { rating: null, count: 0 };
    }
  },
  ["seo:rating"],
  { tags: [CATALOG_TAG, "reviews"], revalidate: 600 },
);
