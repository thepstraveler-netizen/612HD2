import "server-only";
import { unstable_cache } from "next/cache";
import { mediaUrl } from "@/lib/media";
import { createPublicClient } from "@/lib/supabase/public";
import type { PortfolioItem, ServicePlan } from "./b2b-ui";
import { CATALOG_TAG } from "./queries";

/**
 * Published plans and portfolio of a B2B service page, cached with the rest
 * of the catalog (every CMS save revalidates CATALOG_TAG). These sections
 * are optional, so a failed read logs and renders the page without them.
 */

const cacheOptions = { tags: [CATALOG_TAG], revalidate: 3600 };
// The DB-less fallback catalog uses slugs as ids; there is nothing to read then.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getServicePlans = unstable_cache(
  async (serviceId: string): Promise<ServicePlan[]> => {
    const supabase = createPublicClient();
    if (!supabase || !UUID.test(serviceId)) return [];
    const { data, error } = await supabase
      .from("service_plans")
      .select("id, name, summary, price_paise, price_suffix, features, is_popular")
      .eq("service_id", serviceId)
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at");
    if (error) {
      console.error("[catalog] service plans", error.message);
      return [];
    }
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary?.en ? p.summary : null,
      pricePaise: p.price_paise,
      priceSuffix: p.price_suffix?.en ? p.price_suffix : null,
      features: p.features ?? [],
      isPopular: p.is_popular,
    }));
  },
  ["catalog:service-plans"],
  cacheOptions,
);

export const getServicePortfolio = unstable_cache(
  async (serviceId: string): Promise<PortfolioItem[]> => {
    const supabase = createPublicClient();
    if (!supabase || !UUID.test(serviceId)) return [];
    const { data, error } = await supabase
      .from("service_portfolio")
      .select("id, title, caption, client_name, link_url, media:media_id (path, width, height, alt)")
      .eq("service_id", serviceId)
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at");
    if (error) {
      console.error("[catalog] service portfolio", error.message);
      return [];
    }
    return data
      .map((item): PortfolioItem => {
        const media = item.media as {
          path: string;
          width: number | null;
          height: number | null;
          alt: PortfolioItem["title"] | null;
        } | null;
        const src = mediaUrl(media?.path);
        return {
          id: item.id,
          title: item.title,
          caption: item.caption?.en ? item.caption : null,
          clientName: item.client_name,
          linkUrl: item.link_url,
          image: src && media ? { src, width: media.width, height: media.height, alt: media.alt } : null,
        };
      })
      .filter((item) => item.image !== null || item.linkUrl !== null);
  },
  ["catalog:service-portfolio"],
  cacheOptions,
);
