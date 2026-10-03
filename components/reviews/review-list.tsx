"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BadgeCheck, ChevronLeft, ChevronRight, MessageSquareReply, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loadMoreReviews } from "@/lib/reviews/actions";
import type { PublicReview } from "@/lib/reviews/queries";
import { authorInitials, formatReviewDate } from "@/lib/reviews/ui";
import type { ReviewTarget } from "@/schemas/reviews";
import { Stars } from "./stars";

/** Full-screen photo viewer with previous / next. */
export function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
  label,
}: {
  photos: string[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  label: string;
}) {
  const t = useTranslations("reviews");
  const open = index !== null && photos[index] !== undefined;
  const go = (step: number) => index !== null && onIndex((index + step + photos.length) % photos.length);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {open ? t("photoOf", { n: (index ?? 0) + 1, total: photos.length }) : ""}
          </Dialog.Description>
          {open ? (
            // eslint-disable-next-line @next/next/no-img-element -- user photo of unknown size, shown whole
            <img
              src={photos[index ?? 0]}
              alt={t("photoOf", { n: (index ?? 0) + 1, total: photos.length })}
              className="max-h-[85vh] max-w-full rounded-xl object-contain"
            />
          ) : null}
          <Dialog.Close asChild>
            <Button
              size="icon"
              variant="secondary"
              className="absolute top-4 right-4 rounded-full"
              aria-label={t("closePhoto")}
            >
              <X />
            </Button>
          </Dialog.Close>
          {photos.length > 1 ? (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full"
                aria-label={t("previousPhoto")}
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full"
                aria-label={t("nextPhoto")}
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Thumbnails that open the lightbox. */
export function PhotoStrip({ photos, label }: { photos: string[]; label: string }) {
  const t = useTranslations("reviews");
  const [index, setIndex] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block size-20 overflow-hidden rounded-lg border focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:size-24"
              aria-label={t("openPhoto", { n: i + 1, total: photos.length })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail of a user photo */}
              <img src={url} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <PhotoLightbox
        photos={photos}
        index={index}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
        label={label}
      />
    </>
  );
}

export function ReviewCard({ review, verifiedLabel }: { review: PublicReview; verifiedLabel: string }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4">
      <header className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white"
          aria-hidden="true"
        >
          {authorInitials(review.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{review.authorName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-accent-green">
              <BadgeCheck className="size-3.5" aria-hidden="true" /> {verifiedLabel}
            </span>
            <time dateTime={review.createdAt}>{formatReviewDate(review.createdAt, locale)}</time>
          </p>
        </div>
        <Stars rating={review.rating} label={t("starsLabel", { rating: review.rating })} />
      </header>
      {review.title ? <h3 className="font-bold">{review.title}</h3> : null}
      {review.body ? (
        <p className="text-sm leading-relaxed whitespace-pre-line" lang={review.locale}>
          {review.body}
        </p>
      ) : null}
      <PhotoStrip photos={review.photos} label={t("photosBy", { name: review.authorName })} />
      {review.reply ? (
        <div className="rounded-xl border-s-4 border-primary bg-secondary/60 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <MessageSquareReply className="size-4 text-primary" aria-hidden="true" /> {t("staffReply")}
          </p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{review.reply}</p>
        </div>
      ) : null}
    </article>
  );
}

/** The list of reviews with "Load more" (pages through a server action). */
export function ReviewList({
  target,
  initial,
  initialHasMore,
  verifiedLabel,
}: {
  target: ReviewTarget;
  initial: PublicReview[];
  initialHasMore: boolean;
  verifiedLabel: string;
}) {
  const t = useTranslations("reviews");
  const [reviews, setReviews] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const more = () =>
    startTransition(async () => {
      setFailed(false);
      try {
        const next = await loadMoreReviews({ ...target, page: page + 1 });
        const seen = new Set(reviews.map((r) => r.id));
        setReviews((list) => [...list, ...next.reviews.filter((r) => !seen.has(r.id))]);
        setHasMore(next.hasMore);
        setPage((p) => p + 1);
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    });

  return (
    <div className="space-y-4">
      <ul className="grid gap-4" aria-live="polite">
        {reviews.map((r) => (
          <li key={r.id}>
            <ReviewCard review={r} verifiedLabel={verifiedLabel} />
          </li>
        ))}
      </ul>
      {failed ? <p className="text-sm text-destructive">{t("loadFailed")}</p> : null}
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={pending}
          onClick={more}
        >
          {pending ? t("loading") : t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
