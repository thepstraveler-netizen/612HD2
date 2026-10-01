import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { mediaUrl } from "@/lib/media";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { fallbackBusiness, fallbackHomeSections, fallbackNavigation, fallbackServices } from "./fallback";
import type { Banner, BusinessInfo, CatalogService, Faq, HomeSection, NavLink, Testimonial } from "./types";

/**
 * Public catalog reads. Cached across requests and tagged `catalog`; every
 * admin mutation calls `revalidateTag(CATALOG_TAG)` so edits show up on the
 * site immediately without a redeploy.
 */
export const CATALOG_TAG = "catalog";
const cacheOptions = { tags: [CATALOG_TAG], revalidate: 3600 };

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[catalog] ${scope}: ${error.message}`);
}

export const getServices = unstable_cache(
  async (): Promise<CatalogService[]> => {
    const supabase = createPublicClient();
    if (!supabase) return fallbackServices;
    const { data, error } = await supabase
      .from("services")
      .select(
        "id, slug, kind, accent, icon, name, summary, description, highlights, cta_label, show_in_nav, media:hero_media_id (path)",
      )
      .order("sort_order");
    if (error) fail("services", error);
    return data.map((s) => ({
      id: s.id,
      slug: s.slug,
      kind: s.kind,
      accent: s.accent,
      icon: s.icon,
      name: s.name,
      summary: s.summary,
      description: s.description?.en ? s.description : null,
      highlights: s.highlights ?? [],
      ctaLabel: s.cta_label,
      heroImage: mediaUrl((s.media as { path: string } | null)?.path),
      showInNav: s.show_in_nav,
    }));
  },
  ["catalog:services"],
  cacheOptions,
);

export async function getService(slug: string): Promise<CatalogService | undefined> {
  return (await getServices()).find((s) => s.slug === slug);
}

export const getHomeSections = unstable_cache(
  async (): Promise<HomeSection[]> => {
    const supabase = createPublicClient();
    if (!supabase) return fallbackHomeSections;
    const { data, error } = await supabase
      .from("cms_sections")
      .select("key, type, title, subtitle, content")
      .eq("page", "home")
      .order("sort_order");
    if (error) fail("sections", error);
    return data;
  },
  ["catalog:home-sections"],
  cacheOptions,
);

export const getBanners = unstable_cache(
  async (): Promise<Banner[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("offers_banners")
      .select("id, tab, title, subtitle, coupon_code, cta_label, href, accent, media:media_id (path)")
      .order("sort_order");
    if (error) fail("banners", error);
    return data.map((b) => ({
      id: b.id,
      tab: b.tab,
      title: b.title,
      subtitle: b.subtitle,
      couponCode: b.coupon_code,
      ctaLabel: b.cta_label,
      href: b.href,
      accent: b.accent,
      image: mediaUrl((b.media as { path: string } | null)?.path),
    }));
  },
  ["catalog:banners"],
  // Banners have start/end windows, so refresh at least every 5 minutes.
  { tags: [CATALOG_TAG], revalidate: 300 },
);

export const getTestimonials = unstable_cache(
  async (): Promise<Testimonial[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("testimonials")
      .select("id, author_name, author_place, quote, rating")
      .order("sort_order")
      .limit(12);
    if (error) fail("testimonials", error);
    return data.map((t) => ({
      id: t.id,
      authorName: t.author_name,
      authorPlace: t.author_place,
      quote: t.quote,
      rating: t.rating,
    }));
  },
  ["catalog:testimonials"],
  cacheOptions,
);

export const getFaqs = unstable_cache(
  async (serviceId: string | null): Promise<Faq[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    let query = supabase.from("faqs").select("id, question, answer").order("sort_order");
    query = serviceId ? query.eq("service_id", serviceId) : query.is("service_id", null);
    const { data, error } = await query;
    if (error) fail("faqs", error);
    return data;
  },
  ["catalog:faqs"],
  cacheOptions,
);

export const getNavigation = unstable_cache(
  async (menu: "header" | "footer_company" | "footer_legal"): Promise<NavLink[]> => {
    const supabase = createPublicClient();
    if (!supabase) return fallbackNavigation[menu];
    const { data, error } = await supabase
      .from("navigation_links")
      .select("label, href")
      .eq("menu", menu)
      .order("sort_order");
    if (error) fail("navigation", error);
    return data as { label: LocalizedJson; href: string }[];
  },
  ["catalog:navigation"],
  cacheOptions,
);

export const getBusinessInfo = unstable_cache(
  async (): Promise<BusinessInfo> => {
    const supabase = createPublicClient();
    if (!supabase) return fallbackBusiness;
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "business.profile")
      .maybeSingle();
    return { ...fallbackBusiness, ...((data?.value as Partial<BusinessInfo> | null) ?? {}) };
  },
  ["catalog:business"],
  cacheOptions,
);
