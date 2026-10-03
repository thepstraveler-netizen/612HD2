import "server-only";
import { unstable_cache } from "next/cache";
import { mediaUrl } from "@/lib/media";
import { createPublicClient } from "@/lib/supabase/public";
import type { ReviewTarget } from "@/schemas/reviews";
import { REVIEWS_PAGE_SIZE, emptyCounts, ratingDistribution, type RatingDistribution } from "./ui";

/**
 * Public reads of published reviews, through the anon client so RLS and the
 * column grants decide what leaves the database (no author id or booking).
 * The summary and first page are cached under {@link REVIEWS_TAG}, which
 * moderation and replies revalidate.
 */

export const REVIEWS_TAG = "reviews";

export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  locale: "en" | "hi";
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
  photos: string[];
};

export type ReviewPage = { reviews: PublicReview[]; hasMore: boolean };

const COLUMNS = "id, rating, title, body, author_name, locale, created_at, reply, replied_at";

function targetMatch(target: ReviewTarget) {
  switch (target.type) {
    case "hotel":
      return { hotel_id: target.id };
    case "package":
      return { package_id: target.id };
    case "store":
      return { store_id: target.id };
    case "service":
      return { subject_type: "service" as const, service: target.id };
  }
}

/** One page (1-based) of a subject's published reviews, newest first, with their photo URLs. */
export async function fetchReviewPage(target: ReviewTarget, page: number): Promise<ReviewPage> {
  const supabase = createPublicClient();
  if (!supabase) return { reviews: [], hasMore: false };
  const from = (page - 1) * REVIEWS_PAGE_SIZE;
  // One extra row tells whether there is another page.
  const { data, error } = await supabase
    .from("reviews")
    .select(COLUMNS)
    .match(targetMatch(target))
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + REVIEWS_PAGE_SIZE);
  if (error) {
    console.error("[reviews] list failed", error);
    return { reviews: [], hasMore: false };
  }
  const rows = data.slice(0, REVIEWS_PAGE_SIZE);
  const photos = new Map<string, string[]>();
  if (rows.length) {
    const { data: media } = await supabase
      .from("review_media")
      .select("review_id, file_path, sort_order")
      .in(
        "review_id",
        rows.map((r) => r.id),
      )
      .order("sort_order");
    for (const m of media ?? []) {
      const url = mediaUrl(m.file_path);
      if (url) photos.set(m.review_id, [...(photos.get(m.review_id) ?? []), url]);
    }
  }
  return {
    hasMore: data.length > REVIEWS_PAGE_SIZE,
    reviews: rows.map((r) => ({
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
    })),
  };
}

async function fetchDistribution(target: ReviewTarget): Promise<RatingDistribution> {
  const supabase = createPublicClient();
  const counts = emptyCounts();
  if (!supabase) return ratingDistribution(counts);
  const stars = [1, 2, 3, 4, 5] as const;
  const results = await Promise.all(
    stars.map((n) =>
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .match(targetMatch(target))
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

export type ReviewSummary = { distribution: RatingDistribution; first: ReviewPage };

/** Average, 5→1 bars and the first page for one hotel, package, store or service (cached). */
export function getReviewSummary(target: ReviewTarget): Promise<ReviewSummary> {
  return unstable_cache(
    async (): Promise<ReviewSummary> => {
      const [distribution, first] = await Promise.all([
        fetchDistribution(target),
        fetchReviewPage(target, 1),
      ]);
      return { distribution, first };
    },
    ["reviews:summary", target.type, target.id],
    { tags: [REVIEWS_TAG], revalidate: 600 },
  )();
}
