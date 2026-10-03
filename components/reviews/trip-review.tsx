import { BadgeCheck, Clock, MessageSquareReply, Star, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getReviewsSettings } from "@/lib/reviews/settings";
import type { TripReviewState } from "@/lib/reviews/trips";
import { formatReviewDate, reviewNoun } from "@/lib/reviews/ui";
import { ReviewForm } from "./review-form";
import { PhotoStrip } from "./review-list";
import { Stars } from "./stars";

/**
 * My Trips → one booking: "Rate your stay / trip / order" while the booking
 * can be reviewed, then the customer's own review and where it stands.
 */
export async function TripReview({
  state,
  code,
  locale,
}: {
  state: TripReviewState;
  code: string;
  locale: string;
}) {
  if (state.kind === "none") return null;
  const t = await getTranslations("reviews");

  if (state.kind === "open") {
    const settings = await getReviewsSettings();
    const noun = reviewNoun(state.service);
    return (
      <section
        aria-labelledby="rate-title"
        id="review"
        className="scroll-mt-20 space-y-4 rounded-2xl border border-accent-amber/40 bg-accent-amber/5 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-amber/20">
            <Star className="size-5 fill-accent-amber text-accent-amber" aria-hidden="true" />
          </span>
          <div>
            <h2 id="rate-title" className="text-lg font-bold">
              {t(`rate.${noun}`)}
            </h2>
            <p className="text-sm text-muted-foreground">{t("rateLead")}</p>
          </div>
        </div>
        <ReviewForm
          code={code}
          noun={noun}
          maxPhotos={settings.max_photos}
          maxPhotoMb={settings.max_photo_mb}
          minBodyChars={settings.min_body_chars}
        />
      </section>
    );
  }

  const { review } = state;
  const statusLine =
    review.status === "published" ? (
      <p className="flex items-center gap-1.5 text-sm font-medium text-accent-green">
        <BadgeCheck className="size-4" aria-hidden="true" /> {t("own.published")}
      </p>
    ) : review.status === "rejected" ? (
      <div className="flex items-start gap-1.5 text-sm text-destructive">
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">{t("own.rejected")}</p>
          {review.moderationNote ? (
            <p className="text-muted-foreground">{t("own.rejectedNote", { note: review.moderationNote })}</p>
          ) : null}
        </div>
      </div>
    ) : (
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Clock className="size-4 text-accent-orange" aria-hidden="true" /> {t("own.pending")}
      </p>
    );

  return (
    <section
      aria-labelledby="own-review-title"
      id="review"
      className="space-y-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="own-review-title" className="text-base font-bold">
          {t("own.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("own.written", { date: formatReviewDate(review.createdAt, locale) })}
        </span>
      </div>
      {statusLine}
      <Stars rating={review.rating} label={t("starsLabel", { rating: review.rating })} />
      {review.title ? <h3 className="font-semibold">{review.title}</h3> : null}
      {review.body ? <p className="text-sm whitespace-pre-line">{review.body}</p> : null}
      <PhotoStrip photos={review.photos} label={t("own.title")} />
      {review.reply ? (
        <div className="rounded-xl border-s-4 border-primary bg-secondary/60 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <MessageSquareReply className="size-4 text-primary" aria-hidden="true" /> {t("staffReply")}
          </p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{review.reply}</p>
        </div>
      ) : null}
    </section>
  );
}
