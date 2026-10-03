import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createPublicClient } from "@/lib/supabase/public";
import { reviewsSettingsSchema, type ReviewsSettings } from "@/schemas/reviews";

/** `reviews.defaults` is public; cached under the catalog tag (Settings saves revalidate it). */
export const getReviewsSettings = unstable_cache(
  async (): Promise<ReviewsSettings> => {
    const supabase = createPublicClient();
    if (!supabase) return reviewsSettingsSchema.parse({});
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "reviews.defaults")
      .maybeSingle();
    const parsed = reviewsSettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : reviewsSettingsSchema.parse({});
  },
  ["reviews:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
