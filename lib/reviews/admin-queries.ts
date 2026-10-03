import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReviewFilters } from "@/schemas/reviews";
import type { Tables } from "@/types/database";
import { ADMIN_REVIEWS_PAGE_SIZE } from "./ui";

/**
 * Admin → Reviews reads. The moderation columns, author and booking are not
 * granted to signed-in users, so these use the service role, each after
 * {@link assertPermission} for reviews.read.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[reviews admin] ${scope}: ${error.message}`);
}

/** PostgREST `or` filter value: strip characters that would break the expression. */
function searchTerm(q: string): string {
  return q.replace(/[%,()*\\]/g, " ").trim();
}

type SubjectRef = Pick<Tables<"reviews">, "subject_type" | "hotel_id" | "package_id" | "store_id">;

/** Names of the hotels, packages and stores the reviews are about, keyed by id. */
async function subjectNames(rows: SubjectRef[], locale: string): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const ids = (key: "hotel_id" | "package_id" | "store_id") => [
    ...new Set(rows.map((r) => r[key]).filter((v): v is string => !!v)),
  ];
  const [hotels, packages, stores] = await Promise.all([
    ids("hotel_id").length
      ? admin.from("hotels").select("id, name, slug").in("id", ids("hotel_id"))
      : Promise.resolve({ data: [] as { id: string; name: LocalizedJson; slug: string }[] }),
    ids("package_id").length
      ? admin.from("packages").select("id, title, slug").in("id", ids("package_id"))
      : Promise.resolve({ data: [] as { id: string; title: LocalizedJson; slug: string }[] }),
    ids("store_id").length
      ? admin.from("stores").select("id, name, slug").in("id", ids("store_id"))
      : Promise.resolve({ data: [] as { id: string; name: LocalizedJson; slug: string }[] }),
  ]);
  const out = new Map<string, string>();
  for (const h of hotels.data ?? []) out.set(h.id, pickLocalized(h.name, locale));
  for (const p of packages.data ?? []) out.set(p.id, pickLocalized(p.title, locale));
  for (const s of stores.data ?? []) out.set(s.id, pickLocalized(s.name, locale));
  return out;
}

export function subjectId(r: SubjectRef): string | null {
  return r.hotel_id ?? r.package_id ?? r.store_id ?? null;
}

export type AdminReviewRow = Pick<
  Tables<"reviews">,
  | "id"
  | "subject_type"
  | "service"
  | "rating"
  | "title"
  | "body"
  | "author_name"
  | "status"
  | "created_at"
  | "reply"
> & { subjectName: string | null; photoCount: number };

export async function listAdminReviews(
  filters: ReviewFilters,
  locale: string,
): Promise<{ rows: AdminReviewRow[]; total: number; pending: number }> {
  await assertPermission("reviews.read");
  const admin = createAdminClient();
  const from = (filters.page - 1) * ADMIN_REVIEWS_PAGE_SIZE;
  let query = admin
    .from("reviews")
    .select(
      "id, subject_type, hotel_id, package_id, store_id, service, rating, title, body, author_name, status, created_at, reply",
      { count: "exact" },
    )
    // Pending reviews oldest first (a queue); everything else newest first.
    .order("created_at", { ascending: filters.status === "pending" })
    .range(from, from + ADMIN_REVIEWS_PAGE_SIZE - 1);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.subject !== "all") query = query.eq("subject_type", filters.subject);
  if (filters.rating) query = query.eq("rating", filters.rating);
  const q = filters.q ? searchTerm(filters.q) : "";
  if (q) {
    if (/^[A-Z0-9]{6,16}$/i.test(q)) {
      // A booking code.
      const { data: booking } = await admin
        .from("bookings")
        .select("id")
        .eq("code", q.toUpperCase())
        .maybeSingle();
      query = booking
        ? query.eq("booking_id", booking.id)
        : query.or(`title.ilike.%${q}%,body.ilike.%${q}%,author_name.ilike.%${q}%`);
    } else {
      query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,author_name.ilike.%${q}%`);
    }
  }
  const [{ data, count, error }, pending] = await Promise.all([
    query,
    admin.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (error) fail("list", error);
  const ids = data.map((r) => r.id);
  const [names, media] = await Promise.all([
    subjectNames(data, locale),
    ids.length
      ? admin.from("review_media").select("review_id").in("review_id", ids)
      : Promise.resolve({ data: [] as { review_id: string }[] }),
  ]);
  const photoCounts = new Map<string, number>();
  for (const m of media.data ?? []) photoCounts.set(m.review_id, (photoCounts.get(m.review_id) ?? 0) + 1);
  return {
    total: count ?? 0,
    pending: pending.count ?? 0,
    rows: data.map(({ hotel_id, package_id, store_id, ...r }) => {
      const sid = hotel_id ?? package_id ?? store_id;
      return {
        ...r,
        subjectName: sid ? (names.get(sid) ?? null) : null,
        photoCount: photoCounts.get(r.id) ?? 0,
      };
    }),
  };
}

export type AdminReview = {
  review: Tables<"reviews">;
  photos: { path: string; url: string | null }[];
  booking: { id: string; code: string; status: string; contactName: string } | null;
  author: { name: string | null; email: string | null } | null;
  subjectName: string | null;
  subjectSlug: string | null;
  moderator: string | null;
  replier: string | null;
};

export async function getAdminReview(id: string, locale: string): Promise<AdminReview | null> {
  await assertPermission("reviews.read");
  const admin = createAdminClient();
  const { data: review, error } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
  if (error) fail("review", error);
  if (!review) return null;
  const people = [review.user_id, review.moderated_by, review.replied_by].filter((v): v is string => !!v);
  const [{ data: media }, { data: booking }, { data: profiles }, names, slug] = await Promise.all([
    admin.from("review_media").select("file_path").eq("review_id", id).order("sort_order"),
    admin.from("bookings").select("id, code, status, contact_name").eq("id", review.booking_id).maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...new Set(people)]),
    subjectNames([review], locale),
    subjectSlug(review),
  ]);
  const person = (pid: string | null) => {
    const p = pid ? (profiles ?? []).find((x) => x.id === pid) : undefined;
    return p ? p.full_name || p.email : null;
  };
  const author = (profiles ?? []).find((p) => p.id === review.user_id);
  const sid = subjectId(review);
  return {
    review,
    photos: (media ?? []).map((m) => ({ path: m.file_path, url: mediaUrl(m.file_path) })),
    booking: booking
      ? { id: booking.id, code: booking.code, status: booking.status, contactName: booking.contact_name }
      : null,
    author: author ? { name: author.full_name, email: author.email } : null,
    subjectName: sid ? (names.get(sid) ?? null) : null,
    subjectSlug: slug,
    moderator: person(review.moderated_by),
    replier: person(review.replied_by),
  };
}

/** Public page of the subject, for the "view on site" link. */
async function subjectSlug(review: Tables<"reviews">): Promise<string | null> {
  const admin = createAdminClient();
  if (review.hotel_id) {
    const { data } = await admin.from("hotels").select("slug").eq("id", review.hotel_id).maybeSingle();
    return data ? `/hotels/${data.slug}` : null;
  }
  if (review.package_id) {
    const { data } = await admin.from("packages").select("slug").eq("id", review.package_id).maybeSingle();
    return data ? `/packages/${data.slug}` : null;
  }
  if (review.store_id) {
    const { data } = await admin.from("stores").select("slug, kind").eq("id", review.store_id).maybeSingle();
    if (!data) return null;
    if (data.kind === "restaurant") return `/food/${data.slug}`;
    if (data.kind === "grocery") return `/essentials/${data.slug}`;
    return null;
  }
  return null;
}
