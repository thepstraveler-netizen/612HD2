"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  publicReviewsQuerySchema,
  reviewFormSchema,
  reviewSettingsIssue,
  reviewUploadSchema,
  type ReviewStatus,
} from "@/schemas/reviews";
import { notifyReviewPublished } from "./notify";
import { REVIEWS_TAG, fetchReviewPage, type ReviewPage } from "./queries";
import { getReviewsSettings } from "./settings";
import { photoExtension, reviewErrorKey } from "./ui";

/**
 * Customer review actions (D-084). Photos go straight to the public `media`
 * bucket under reviews/<user id>/ with a one-time signed URL; the review
 * itself is written by the service-role SQL function submit_review, which
 * checks eligibility again. Errors are keys under `reviews.errors`.
 */

export type ReviewUploadResult =
  | { ok: true; path: string; token: string }
  | {
      ok: false;
      error: "signIn" | "badFile" | "tooLarge" | "tooManyPhotos" | "unavailable" | "uploadFailed";
    };

export type SubmitReviewResult =
  { ok: true; status: ReviewStatus } | { ok: false; error: string; field?: string };

export async function createReviewUpload(input: unknown, alreadyUploaded = 0): Promise<ReviewUploadResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signIn" };
  if (session.profile?.is_blocked) return { ok: false, error: "unavailable" };
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };
  const parsed = reviewUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message === "tooLarge" ? "tooLarge" : "badFile" };
  }
  const settings = await getReviewsSettings();
  if (!Number.isInteger(alreadyUploaded) || alreadyUploaded < 0 || alreadyUploaded >= settings.max_photos) {
    return { ok: false, error: "tooManyPhotos" };
  }
  if (parsed.data.size_bytes > settings.max_photo_mb * 1024 * 1024) return { ok: false, error: "tooLarge" };
  const path = `reviews/${session.user.id}/${crypto.randomUUID()}.${photoExtension(parsed.data.mime_type)}`;
  const { data, error } = await createAdminClient().storage.from("media").createSignedUploadUrl(path);
  if (error) {
    console.error("[reviews] signed upload", error);
    return { ok: false, error: "uploadFailed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

export async function submitReview(input: unknown): Promise<SubmitReviewResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signIn" };
  if (session.profile?.is_blocked) return { ok: false, error: "notEligible" };
  const parsed = reviewFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };
  const values = parsed.data;
  const settings = await getReviewsSettings();
  const issue = reviewSettingsIssue(values, settings);
  if (issue) return { ok: false, error: issue.error, field: issue.field };
  // Photos must be ones this user uploaded through createReviewUpload.
  if (values.photos.some((p) => !p.startsWith(`reviews/${session.user.id}/`))) {
    return { ok: false, error: "badFile", field: "photos" };
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("code", values.code)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!booking) return { ok: false, error: "notEligible" };

  const { data: review, error } = await admin.rpc("submit_review", {
    p: {
      user_id: session.user.id,
      booking_id: booking.id,
      rating: values.rating,
      title: values.title,
      body: values.body,
      photos: [...new Set(values.photos)],
      locale: values.locale,
    },
  });
  if (error) {
    const key = reviewErrorKey(error.message);
    if (!key) console.error("[reviews] submit failed", error);
    return { ok: false, error: key ?? "submitFailed" };
  }
  revalidatePath("/[locale]/account/trips", "layout");
  if (review.status === "published") {
    revalidateTag(REVIEWS_TAG);
    revalidateTag(CATALOG_TAG);
    await notifyReviewPublished(review);
  }
  return { ok: true, status: review.status };
}

/** Next page of a public reviews list ("Load more"). */
export async function loadMoreReviews(input: unknown): Promise<ReviewPage> {
  const parsed = publicReviewsQuerySchema.safeParse(input);
  if (!parsed.success) return { reviews: [], hasMore: false };
  const { page, ...target } = parsed.data;
  return fetchReviewPage(target, page);
}
