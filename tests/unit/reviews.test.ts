import { describe, expect, it } from "vitest";
import {
  authorInitials,
  checkPhoto,
  formatReviewDate,
  isReviewOpen,
  photoExtension,
  ratingDistribution,
  reviewErrorKey,
  reviewFiltersQuery,
  reviewNoun,
  reviewStatusTone,
} from "@/lib/reviews/ui";
import {
  moderateReviewSchema,
  publicReviewsQuerySchema,
  replyReviewSchema,
  reviewFiltersSchema,
  reviewFormSchema,
  reviewSettingsIssue,
  reviewsSettingsSchema,
  reviewUploadSchema,
} from "@/schemas/reviews";

const uid = "0b5f3c1e-7a4d-4c8e-9f1a-2b3c4d5e6f70";
const photo = `reviews/${uid}/1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.jpg`;

describe("review settings", () => {
  it("fills the defaults from an empty setting", () => {
    expect(reviewsSettingsSchema.parse({})).toEqual({
      auto_publish: false,
      window_days: 180,
      max_photos: 5,
      max_photo_mb: 5,
      min_body_chars: 0,
    });
  });

  it("checks the shortest body and the photo count against the live settings", () => {
    const settings = { min_body_chars: 20, max_photos: 1 };
    expect(reviewSettingsIssue({ body: "Too short", photos: [] }, settings)).toEqual({
      field: "body",
      error: "bodyTooShort",
    });
    expect(reviewSettingsIssue({ body: "x".repeat(20), photos: [photo, photo] }, settings)).toEqual({
      field: "photos",
      error: "tooManyPhotos",
    });
    expect(reviewSettingsIssue({ body: "x".repeat(20), photos: [photo] }, settings)).toBeNull();
  });
});

describe("review form schema", () => {
  it("accepts a rating-only review and trims text", () => {
    const parsed = reviewFormSchema.parse({ code: "PS7K2M9Q", rating: "4", title: "  Lovely  " });
    expect(parsed).toEqual({
      code: "PS7K2M9Q",
      rating: 4,
      title: "Lovely",
      body: "",
      photos: [],
      locale: "en",
    });
  });

  it("needs a whole rating between 1 and 5", () => {
    for (const rating of [0, 6, 3.5, "", undefined]) {
      const r = reviewFormSchema.safeParse({ code: "PS7K2M9Q", rating });
      expect(r.success, String(rating)).toBe(false);
      expect(r.error?.issues[0]?.message).toBe("ratingRequired");
    }
  });

  it("rejects photo paths outside reviews/<uuid>/ and over-long text", () => {
    expect(
      reviewFormSchema.safeParse({ code: "PS7K2M9Q", rating: 5, photos: ["partners/x/y.jpg"] }).success,
    ).toBe(false);
    expect(reviewFormSchema.safeParse({ code: "PS7K2M9Q", rating: 5, photos: [photo] }).success).toBe(true);
    const long = reviewFormSchema.safeParse({ code: "PS7K2M9Q", rating: 5, body: "x".repeat(2001) });
    expect(long.error?.issues[0]?.message).toBe("bodyTooLong");
  });

  it("only uploads images up to the hard ceiling", () => {
    expect(reviewUploadSchema.safeParse({ mime_type: "image/webp", size_bytes: 1000 }).success).toBe(true);
    expect(
      reviewUploadSchema.safeParse({ mime_type: "application/pdf", size_bytes: 1000 }).error?.issues[0]
        ?.message,
    ).toBe("badFile");
    expect(
      reviewUploadSchema.safeParse({ mime_type: "image/png", size_bytes: 11 * 1024 * 1024 }).error?.issues[0]
        ?.message,
    ).toBe("tooLarge");
  });
});

describe("admin schemas", () => {
  const id = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

  it("needs a reason to reject but not to publish", () => {
    expect(moderateReviewSchema.safeParse({ id, status: "published" }).success).toBe(true);
    const r = moderateReviewSchema.safeParse({ id, status: "rejected", note: "   " });
    expect(r.error?.issues[0]).toMatchObject({ message: "reasonRequired", path: ["note"] });
    expect(moderateReviewSchema.safeParse({ id, status: "pending" }).success).toBe(false);
  });

  it("lets an empty reply clear it", () => {
    expect(replyReviewSchema.parse({ id, reply: "  " })).toEqual({ id, reply: "" });
    expect(replyReviewSchema.safeParse({ id, reply: "x".repeat(1001) }).error?.issues[0]?.message).toBe(
      "replyTooLong",
    );
  });

  it("reads list filters from the URL and ignores junk", () => {
    expect(reviewFiltersSchema.parse({})).toEqual({ status: "pending", subject: "all", page: 1 });
    expect(
      reviewFiltersSchema.parse({ status: "nope", subject: "hotel", rating: "9", page: "-3", q: " " }),
    ).toEqual({
      status: "pending",
      subject: "hotel",
      page: 1,
    });
    const f = reviewFiltersSchema.parse({ status: "all", rating: "2", q: "dirty", page: ["3"] });
    expect(f).toEqual({ status: "all", subject: "all", rating: 2, q: "dirty", page: 3 });
    expect(reviewFiltersQuery(f, { page: 4 })).toBe("?status=all&rating=2&q=dirty&page=4");
    expect(reviewFiltersQuery(reviewFiltersSchema.parse({}))).toBe("");
  });

  it("pages public lists only for real subjects", () => {
    expect(publicReviewsQuerySchema.safeParse({ type: "hotel", id, page: 2 }).success).toBe(true);
    expect(publicReviewsQuerySchema.safeParse({ type: "service", id: "cab", page: 2 }).success).toBe(true);
    expect(publicReviewsQuerySchema.safeParse({ type: "service", id: "hotel", page: 2 }).success).toBe(false);
    expect(publicReviewsQuerySchema.safeParse({ type: "hotel", id, page: 1 }).success).toBe(false);
  });
});

describe("review helpers", () => {
  it("builds the 5 → 1 distribution and average", () => {
    const d = ratingDistribution([5, 5, 4, 3, 1, 5]);
    expect(d.total).toBe(6);
    expect(d.average).toBe(3.8);
    expect(d.rows.map((r) => r.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(d.rows[0]).toEqual({ stars: 5, count: 3, percent: 50 });
    expect(d.rows[3]).toEqual({ stars: 2, count: 0, percent: 0 });
    expect(ratingDistribution({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })).toMatchObject({ total: 0, average: null });
    expect(ratingDistribution({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 3 }).average).toBe(4.8);
  });

  it("formats authors and dates", () => {
    expect(authorInitials("Priya S.")).toBe("PS");
    expect(authorInitials("Guest")).toBe("G");
    expect(authorInitials("")).toBe("?");
    expect(formatReviewDate("2026-10-12T20:00:00Z", "en")).toBe("13 Oct 2026");
    expect(formatReviewDate("2026-10-12T06:00:00Z", "hi")).toContain("2026");
  });

  it("maps database errors to message keys", () => {
    expect(reviewErrorKey("new row violates: not_eligible")).toBe("notEligible");
    expect(reviewErrorKey("invalid_photo")).toBe("badFile");
    expect(reviewErrorKey("reason_required")).toBe("reasonRequired");
    expect(reviewErrorKey('duplicate key value violates unique constraint "reviews_booking_id_key"')).toBe(
      "alreadyReviewed",
    );
    expect(reviewErrorKey("something else")).toBeNull();
  });

  it("checks photos and picks their extension", () => {
    expect(checkPhoto({ type: "image/heic", size: 10 }, 5)).toBe("badFile");
    expect(checkPhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 }, 5)).toBe("tooLarge");
    expect(checkPhoto({ type: "image/jpeg", size: 1024 }, 5)).toBeNull();
    expect(photoExtension("image/png")).toBe("png");
    expect(photoExtension("image/jpeg")).toBe("jpg");
  });

  it("names the booking and the status tone", () => {
    expect(reviewNoun("hotel")).toBe("stay");
    expect(reviewNoun("food")).toBe("order");
    expect(reviewNoun("cab")).toBe("trip");
    expect(reviewStatusTone("pending")).toBe("warning");
    expect(reviewStatusTone("published")).toBe("success");
    expect(reviewStatusTone("rejected")).toBe("danger");
  });

  it("opens reviews like review_target(): finished bookings within the window", () => {
    const today = "2026-10-03";
    const base = { completedAt: null, endDate: null, today, windowDays: 180 };
    expect(isReviewOpen({ ...base, status: "completed", completedAt: "2026-10-01T10:00:00Z" })).toBe(true);
    expect(isReviewOpen({ ...base, status: "completed", completedAt: "2026-03-01T10:00:00Z" })).toBe(false);
    expect(isReviewOpen({ ...base, status: "confirmed", endDate: "2026-10-03" })).toBe(true);
    expect(isReviewOpen({ ...base, status: "confirmed", endDate: "2026-10-04" })).toBe(false);
    expect(isReviewOpen({ ...base, status: "confirmed" })).toBe(false);
    expect(isReviewOpen({ ...base, status: "cancelled", endDate: "2026-10-01" })).toBe(false);
    expect(isReviewOpen({ ...base, status: "confirmed", endDate: "2026-04-05" })).toBe(false);
  });
});
