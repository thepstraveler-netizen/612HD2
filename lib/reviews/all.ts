import "server-only";
import { unstable_cache } from "next/cache";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { createPublicClient } from "@/lib/supabase/public";
import { REVIEWS_TAG, type PublicReview } from "./queries";
import { emptyCounts, ratingDistribution, type RatingDistribution } from "./ui";

/**
 * Every published review across hotels, tours, stores and services for the
 * public /reviews page, newest first, through the anon client (RLS and the
 * column grants decide what leaves the database).
 */

export const ALL_REVIEWS_PAGE_SIZE = 12;

export type ReviewWithSubject = PublicReview & {
  service: string;
  /** The hotel, tour or store name, when it is still public. */
  subjectName: string | null;
  subjectHref: string | null;
};

export type AllReviewsPage = { reviews: ReviewWithSubject[]; total: number; page: number; pages: number };

const COLUMNS =
  "id, rating, title, body, author_name, locale, created_at, reply, replied_at, service, hotel_id, package_id, store_id";

type Named = { name: LocalizedJson; slug: string };

const ids = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))];

async function fetchPage(page: number, locale: string): Promise<AllReviewsPage> {
  const supabase = createPublicClient();
  if (!supabase) return { reviews: [], total: 0, page: 1, pages: 1 };
  const from = (page - 1) * ALL_REVIEWS_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("reviews")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + ALL_REVIEWS_PAGE_SIZE - 1);
  if (error) {
    console.error("[reviews] all failed", error);
    return { reviews: [], total: 0, page: 1, pages: 1 };
  }
  const photos = new Map<string, string[]>();
  if (data.length) {
    const { data: media } = await supabase
      .from("review_media")
      .select("review_id, file_path, sort_order")
      .in(
        "review_id",
        data.map((r) => r.id),
      )
      .order("sort_order");
    for (const m of media ?? []) {
      const url = mediaUrl(m.file_path);
      if (url) photos.set(m.review_id, [...(photos.get(m.review_id) ?? []), url]);
    }
  }
  // Names of the hotels, tours and stores reviewed; hidden (unpublished) ones simply don't come back.
  const [hotels, packages, stores] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, slug")
      .in("id", ids(data.map((r) => r.hotel_id))),
    supabase
      .from("packages")
      .select("id, title, slug")
      .in("id", ids(data.map((r) => r.package_id))),
    supabase
      .from("stores")
      .select("id, name, slug")
      .in("id", ids(data.map((r) => r.store_id))),
  ]);
  const hotelById = new Map<string, Named>((hotels.data ?? []).map((h) => [h.id, h]));
  const packageById = new Map<string, Named>(
    (packages.data ?? []).map((p) => [p.id, { name: p.title, slug: p.slug }]),
  );
  const storeById = new Map<string, Named>((stores.data ?? []).map((st) => [st.id, st]));
  const subjectOf = (r: (typeof data)[number]) => {
    const hotel = r.hotel_id ? hotelById.get(r.hotel_id) : undefined;
    if (hotel)
      return { subjectName: pickLocalized(hotel.name, locale), subjectHref: `/hotels/${hotel.slug}` };
    const pkg = r.package_id ? packageById.get(r.package_id) : undefined;
    if (pkg) return { subjectName: pickLocalized(pkg.name, locale), subjectHref: `/packages/${pkg.slug}` };
    const store = r.store_id ? storeById.get(r.store_id) : undefined;
    if (store) {
      const href =
        r.service === "food" || r.service === "essentials" ? `/${r.service}/${store.slug}` : `/${r.service}`;
      return { subjectName: pickLocalized(store.name, locale), subjectHref: href };
    }
    return { subjectName: null, subjectHref: null };
  };
  const total = count ?? data.length;
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ALL_REVIEWS_PAGE_SIZE)),
    reviews: data.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      authorName: r.author_name,
      locale: r.locale,
      createdAt: r.created_at,
      reply: r.reply,
      repliedAt: r.replied_at,
      photos: photos.get(r.id) ?? [],
      service: r.service,
      ...subjectOf(r),
    })),
  };
}

async function fetchDistribution(): Promise<RatingDistribution> {
  const supabase = createPublicClient();
  const counts = emptyCounts();
  if (!supabase) return ratingDistribution(counts);
  const stars = [1, 2, 3, 4, 5] as const;
  const results = await Promise.all(
    stars.map((n) =>
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("rating", n),
    ),
  );
  results.forEach((r, i) => {
    if (r.error) console.error("[reviews] count failed", r.error);
    counts[stars[i]] = r.count ?? 0;
  });
  return ratingDistribution(counts);
}

/** The overall rating spread and one page of every published review (cached; moderation revalidates). */
export function getAllReviews(
  page: number,
  locale: string,
): Promise<{ distribution: RatingDistribution; list: AllReviewsPage }> {
  return unstable_cache(
    async () => {
      const [distribution, list] = await Promise.all([fetchDistribution(), fetchPage(page, locale)]);
      return { distribution, list };
    },
    ["reviews:all", String(page), locale],
    { tags: [REVIEWS_TAG], revalidate: 600 },
  )();
}
