import "server-only";
import { todayInIndia } from "@/lib/dates";
import { hasServiceRole } from "@/lib/env.server";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReviewStatus } from "@/schemas/reviews";
import { getReviewsSettings } from "./settings";
import { isReviewOpen } from "./ui";

/**
 * The customer's side of reviews on My Trips. The author and booking of a
 * review are not readable through RLS column grants, so these read with the
 * service role; every query is pinned to the signed-in user's id, which the
 * caller takes from requireUser().
 */

export type OwnReview = {
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  moderationNote: string | null;
  reply: string | null;
  createdAt: string;
  photos: string[];
};

export type TripReviewState =
  { kind: "none" } | { kind: "open"; service: string } | { kind: "written"; review: OwnReview };

export async function getTripReviewState(userId: string, bookingId: string): Promise<TripReviewState> {
  if (!hasServiceRole()) return { kind: "none" };
  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, rating, title, body, status, moderation_note, reply, created_at")
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (review) {
    const { data: media } = await admin
      .from("review_media")
      .select("file_path")
      .eq("review_id", review.id)
      .order("sort_order");
    return {
      kind: "written",
      review: {
        rating: review.rating,
        title: review.title,
        body: review.body,
        status: review.status,
        moderationNote: review.moderation_note,
        reply: review.reply,
        createdAt: review.created_at,
        photos: (media ?? []).map((m) => mediaUrl(m.file_path)).filter((u): u is string => !!u),
      },
    };
  }
  const { data: target, error } = await admin.rpc("review_target", {
    p_booking_id: bookingId,
    p_user: userId,
  });
  if (error) {
    console.error("[reviews] review_target failed", error);
    return { kind: "none" };
  }
  if (!target || typeof target !== "object" || Array.isArray(target)) return { kind: "none" };
  const service = typeof target.service === "string" ? target.service : "hotel";
  return { kind: "open", service };
}

/**
 * Booking codes on the trips list that can be reviewed now: three batched
 * queries for the whole list (bookings, their reviews, package end dates),
 * checked with the same rule as SQL review_target().
 */
export async function reviewableCodes(userId: string, codes: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!codes.length || !hasServiceRole()) return out;
  const admin = createAdminClient();
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, code, status, service, check_out, completed_at")
    .eq("user_id", userId)
    .in("code", codes)
    .in("status", ["completed", "confirmed"]);
  if (!bookings?.length) return out;
  const ids = bookings.map((b) => b.id);
  const [{ data: reviewed }, { data: packages }, settings] = await Promise.all([
    admin.from("reviews").select("booking_id").eq("user_id", userId).in("booking_id", ids),
    admin.from("package_bookings").select("booking_id, end_date").in("booking_id", ids),
    getReviewsSettings(),
  ]);
  const done = new Set((reviewed ?? []).map((r) => r.booking_id));
  const ends = new Map((packages ?? []).map((p) => [p.booking_id, p.end_date]));
  const today = todayInIndia();
  for (const b of bookings) {
    if (done.has(b.id)) continue;
    const endDate = b.service === "hotel" ? b.check_out : (ends.get(b.id) ?? null);
    if (
      isReviewOpen({
        status: b.status,
        completedAt: b.completed_at,
        endDate,
        today,
        windowDays: settings.window_days,
      })
    ) {
      out.add(b.code);
    }
  }
  return out;
}
