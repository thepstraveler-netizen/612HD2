import { BadgeCheck, MessageSquareText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getReviewSummary } from "@/lib/reviews/queries";
import { reviewNoun } from "@/lib/reviews/ui";
import type { ReviewTarget } from "@/schemas/reviews";
import { ReviewList } from "./review-list";
import { Stars } from "./stars";

/**
 * Published, verified-booking reviews for a hotel, package, store or service:
 * average, count, 5 → 1 distribution and the newest reviews with "Load more".
 */
export async function ReviewsSection({
  target,
  service,
  className,
}: {
  target: ReviewTarget;
  /** The booking service behind the subject, for "Verified stay / booking / order". */
  service: string;
  className?: string;
}) {
  const [t, { distribution, first }] = await Promise.all([
    getTranslations("reviews"),
    getReviewSummary(target),
  ]);
  const noun = reviewNoun(service);
  const verified = t(`verified.${noun}`);
  const headingId = `reviews-${target.type}`;

  return (
    <section aria-labelledby={headingId} className={className ?? "scroll-mt-20 space-y-4"} id="reviews">
      <h2 id={headingId} className="text-xl font-bold">
        {t("title")}
      </h2>
      {distribution.total === 0 || distribution.average === null ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-card p-4 text-sm">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="text-muted-foreground">{t(`emptyBody.${noun}`)}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-[11rem_1fr] sm:items-center">
            <div className="space-y-1 text-center sm:border-e sm:pe-4">
              <p className="text-4xl font-extrabold text-brand-navy dark:text-foreground">
                {distribution.average.toFixed(1)}
              </p>
              <Stars
                rating={distribution.average}
                label={t("averageLabel", { rating: distribution.average.toFixed(1) })}
                className="justify-center"
              />
              <p className="text-sm text-muted-foreground">{t("count", { count: distribution.total })}</p>
              <p className="inline-flex items-center gap-1 text-xs font-medium text-accent-green">
                <BadgeCheck className="size-3.5" aria-hidden="true" /> {t(`allVerified.${noun}`)}
              </p>
            </div>
            <ul className="grid gap-1.5" aria-label={t("distributionLabel")}>
              {distribution.rows.map((row) => (
                <li key={row.stars} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("starsShort", { count: row.stars })}</span>
                  <span
                    className="h-2.5 overflow-hidden rounded-full bg-secondary"
                    role="img"
                    aria-label={t("barLabel", { stars: row.stars, count: row.count, percent: row.percent })}
                  >
                    <span
                      className="block h-full rounded-full bg-accent-amber"
                      style={{ width: `${row.percent}%` }}
                    />
                  </span>
                  <span className="text-end text-muted-foreground tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <ReviewList
            target={target}
            initial={first.reviews}
            initialHasMore={first.hasMore}
            verifiedLabel={verified}
          />
        </>
      )}
    </section>
  );
}
