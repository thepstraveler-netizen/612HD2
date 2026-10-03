import { z } from "zod";

/**
 * Verified reviews (D-084): the `reviews.defaults` setting, the customer's
 * review form and photo uploads, public paging, and the staff moderation
 * actions. Error messages are message keys (`reviews.errors.*` on the
 * customer side, `reviewsAdmin.errors.*` in admin).
 */

export const REVIEW_SUBJECTS = ["hotel", "package", "store", "service"] as const;
export type ReviewSubject = (typeof REVIEW_SUBJECTS)[number];
export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
/** Services reviewed as the service itself (no hotel, package or store behind them). */
export const REVIEW_SERVICES = ["cab", "ride", "travel"] as const;

export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReviewPhotoType = (typeof REVIEW_PHOTO_TYPES)[number];
/** Hard ceilings; the live limits come from `reviews.defaults`. */
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 2000;
export const REVIEW_PHOTOS_MAX = 10;
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_REPLY_MAX = 1000;

/** `reviews.defaults` (public). */
export const reviewsSettingsSchema = z.object({
  auto_publish: z.boolean().default(false),
  window_days: z.number().int().min(1).max(3650).default(180),
  max_photos: z.number().int().min(0).max(REVIEW_PHOTOS_MAX).default(5),
  max_photo_mb: z.number().min(0.1).max(10).default(5),
  min_body_chars: z.number().int().min(0).max(REVIEW_BODY_MAX).default(0),
});
export type ReviewsSettings = z.output<typeof reviewsSettingsSchema>;

/** One photo the customer wants to upload (before the signed URL is issued). */
export const reviewUploadSchema = z.object({
  mime_type: z.enum(REVIEW_PHOTO_TYPES, { error: "badFile" }),
  size_bytes: z
    .number()
    .int()
    .positive({ error: "badFile" })
    .max(10 * 1024 * 1024, { error: "tooLarge" }),
});

/** A photo path issued by createReviewUpload (the owner's folder is checked on the server and in SQL). */
export const reviewPhotoPathSchema = z
  .string()
  .regex(/^reviews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/, { error: "badFile" });

export const reviewFormSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6,16}$/, { error: "notEligible" }),
  rating: z.coerce
    .number({ error: "ratingRequired" })
    .int({ error: "ratingRequired" })
    .min(1, { error: "ratingRequired" })
    .max(5, { error: "ratingRequired" }),
  title: z.string().trim().max(REVIEW_TITLE_MAX, { error: "titleTooLong" }).default(""),
  body: z.string().trim().max(REVIEW_BODY_MAX, { error: "bodyTooLong" }).default(""),
  photos: z.array(reviewPhotoPathSchema).max(REVIEW_PHOTOS_MAX, { error: "tooManyPhotos" }).default([]),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type ReviewFormInput = z.input<typeof reviewFormSchema>;
export type ReviewFormValues = z.output<typeof reviewFormSchema>;

/** Rules that depend on the live settings: shortest body and photo count. */
export function reviewSettingsIssue(
  values: Pick<ReviewFormValues, "body" | "photos">,
  settings: Pick<ReviewsSettings, "min_body_chars" | "max_photos">,
): { field: "body" | "photos"; error: "bodyTooShort" | "tooManyPhotos" } | null {
  if (values.body.length < settings.min_body_chars) return { field: "body", error: "bodyTooShort" };
  if (values.photos.length > settings.max_photos) return { field: "photos", error: "tooManyPhotos" };
  return null;
}

/** "Load more" on a public reviews list. */
export const publicReviewsQuerySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["hotel", "package", "store"]),
    id: z.uuid(),
    page: z.number().int().min(2).max(500),
  }),
  z.object({
    type: z.literal("service"),
    id: z.enum(REVIEW_SERVICES),
    page: z.number().int().min(2).max(500),
  }),
]);
export type ReviewTarget =
  | { type: "hotel" | "package" | "store"; id: string }
  | { type: "service"; id: (typeof REVIEW_SERVICES)[number] };

// ---------------------------------------------------------------- admin

export const moderateReviewSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["published", "rejected"]),
    note: z.string().trim().max(REVIEW_NOTE_MAX, { error: "noteTooLong" }).default(""),
  })
  .refine((v) => v.status !== "rejected" || v.note.length > 0, {
    error: "reasonRequired",
    path: ["note"],
  });

export const replyReviewSchema = z.object({
  id: z.uuid(),
  // Empty clears the reply.
  reply: z.string().trim().max(REVIEW_REPLY_MAX, { error: "replyTooLong" }).default(""),
});

const firstString = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const blankToUndefined = (v: unknown) => {
  const s = firstString(v);
  return typeof s === "string" && s.trim() === "" ? undefined : s;
};

/** Admin → Reviews list filters (from the URL; anything invalid falls back to the default). */
export const reviewFiltersSchema = z.object({
  status: z
    .preprocess(blankToUndefined, z.enum([...REVIEW_STATUSES, "all"]).catch("pending"))
    .default("pending"),
  subject: z.preprocess(blankToUndefined, z.enum([...REVIEW_SUBJECTS, "all"]).catch("all")).default("all"),
  rating: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(5).optional().catch(undefined)),
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional().catch(undefined)),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10_000).catch(1)).default(1),
});
export type ReviewFilters = z.output<typeof reviewFiltersSchema>;
