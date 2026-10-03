import type { Tone } from "@/components/admin/booking-status";
import { addDays } from "@/lib/dates";
import type { ReviewFilters, ReviewPhotoType, ReviewStatus } from "@/schemas/reviews";

/** Pure helpers shared by the public reviews section, My Trips and Admin → Reviews. */

export const REVIEWS_PAGE_SIZE = 6;
export const ADMIN_REVIEWS_PAGE_SIZE = 25;

export type RatingCounts = Record<1 | 2 | 3 | 4 | 5, number>;
export type RatingDistribution = {
  total: number;
  /** One decimal, or null when nothing is published yet. */
  average: number | null;
  /** 5 → 1, each with its share of the total (0–100, rounded). */
  rows: { stars: 1 | 2 | 3 | 4 | 5; count: number; percent: number }[];
};

export function emptyCounts(): RatingCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Counts per star (from any list of ratings) → average and 5→1 bars. */
export function ratingDistribution(input: RatingCounts | readonly number[]): RatingDistribution {
  const counts = emptyCounts();
  if (Array.isArray(input)) {
    for (const r of input) if (r >= 1 && r <= 5 && Number.isInteger(r)) counts[r as 1 | 2 | 3 | 4 | 5] += 1;
  } else {
    Object.assign(counts, input);
  }
  const stars = [5, 4, 3, 2, 1] as const;
  const total = stars.reduce((s, n) => s + counts[n], 0);
  const sum = stars.reduce((s, n) => s + n * counts[n], 0);
  return {
    total,
    average: total ? Math.round((sum / total) * 10) / 10 : null,
    rows: stars.map((n) => ({
      stars: n,
      count: counts[n],
      percent: total ? Math.round((counts[n] / total) * 100) : 0,
    })),
  };
}

/** "Priya S." → "PS" for the avatar circle. */
export function authorInitials(name: string): string {
  const parts = name.replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

/** Review dates as "12 Oct 2026" in India time. */
export function formatReviewDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/** File extension for an uploaded review photo. */
export function photoExtension(mime: ReviewPhotoType): "jpg" | "png" | "webp" {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

/** Client-side photo check before asking for an upload URL (the server checks again). */
export function checkPhoto(
  file: { type: string; size: number },
  maxMb: number,
): "badFile" | "tooLarge" | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "badFile";
  if (file.size <= 0) return "badFile";
  if (file.size > maxMb * 1024 * 1024) return "tooLarge";
  return null;
}

const DB_ERRORS: [string, string][] = [
  ["not_eligible", "notEligible"],
  ["invalid_photo", "badFile"],
  ["reason_required", "reasonRequired"],
  ["not_found", "notFound"],
  ["reviews_booking_id_key", "alreadyReviewed"],
  ["duplicate key", "alreadyReviewed"],
];

/** A database error from the review functions → message key (null when unknown). */
export function reviewErrorKey(message: string): string | null {
  return DB_ERRORS.find(([code]) => message.includes(code))?.[1] ?? null;
}

export function reviewStatusTone(status: ReviewStatus): Tone {
  return status === "published" ? "success" : status === "rejected" ? "danger" : "warning";
}

/** "stay" (hotel), "trip" (package, cab, ride, travel) or "order" (food, essentials, medicine). */
export function reviewNoun(service: string): "stay" | "trip" | "order" {
  if (service === "hotel") return "stay";
  if (service === "food" || service === "essentials" || service === "medicine") return "order";
  return "trip";
}

/**
 * Whether a booking is open for review, mirroring SQL review_target(): completed,
 * or a confirmed stay/package whose end date has passed, and no older than
 * `windowDays`. Used for the cheap "Write a review" hint on the trips list; the
 * trip page and submitReview ask the database.
 */
export function isReviewOpen(input: {
  status: string;
  completedAt: string | null;
  endDate: string | null;
  today: string;
  windowDays: number;
}): boolean {
  const { status, completedAt, endDate, today, windowDays } = input;
  if (!(status === "completed" || (status === "confirmed" && endDate !== null && endDate <= today))) {
    return false;
  }
  const since = completedAt ? indiaDate(completedAt) : endDate;
  if (!since) return true;
  return since >= addDays(today, -windowDays);
}

function indiaDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/** Query string for Admin → Reviews (defaults left out). */
export function reviewFiltersQuery(filters: ReviewFilters, patch: Partial<ReviewFilters> = {}): string {
  const f = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (f.status !== "pending") params.set("status", f.status);
  if (f.subject !== "all") params.set("subject", f.subject);
  if (f.rating) params.set("rating", String(f.rating));
  if (f.q) params.set("q", f.q);
  if (f.page > 1) params.set("page", String(f.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
