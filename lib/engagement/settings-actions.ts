"use server";

import { mutate, type Supabase } from "@/lib/admin/mutate";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { loyaltySettingsSchema } from "@/lib/loyalty/rules";
import { loyaltySettingsFormSchema, reviewsSettingsFormSchema } from "@/schemas/engagement-admin";
import { reviewsSettingsSchema } from "@/schemas/reviews";
import type { Json } from "@/types/database";
import { loyaltySettingsValue, reviewsSettingsValue } from "./admin-rows";

/**
 * Settings → Reviews & rewards, through {@link mutate} with settings.write
 * (signed-in client, so RLS and the audit log apply; the catalog tag is
 * revalidated so the cached public settings update). Both rows are public:
 * the review form and the rewards page read them.
 */

const invalidContent = { message: "invalidContent", code: "invalidContent" };

async function save(db: Supabase, key: string, value: { [key: string]: Json | undefined }) {
  const { data: stored, error } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) return { error };
  return {
    error: (
      await db
        .from("settings")
        .upsert({ key, value: mergeSettingValue(stored?.value, value), is_public: true })
    ).error,
  };
}

export async function saveReviewsSettings(input: unknown) {
  return mutate("settings.write", reviewsSettingsFormSchema, input, async (form, db) => {
    const value = reviewsSettingsSchema.safeParse(reviewsSettingsValue(form));
    if (!value.success) return { error: invalidContent };
    return save(db, "reviews.defaults", value.data);
  });
}

export async function saveLoyaltySettings(input: unknown) {
  return mutate("settings.write", loyaltySettingsFormSchema, input, async (form, db) => {
    const value = loyaltySettingsSchema.safeParse(loyaltySettingsValue(form));
    if (!value.success) return { error: invalidContent };
    return save(db, "loyalty.defaults", value.data as { [key: string]: Json | undefined });
  });
}
