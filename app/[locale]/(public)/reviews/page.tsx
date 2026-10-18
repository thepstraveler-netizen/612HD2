import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReviewCard } from "@/components/reviews/review-list";
import { Stars } from "@/components/reviews/stars";
import { SectionTitle } from "@/components/shared/section-title";
import { Link } from "@/i18n/navigation";
import { getAllReviews } from "@/lib/reviews/all";
import { reviewNoun } from "@/lib/reviews/ui";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "allReviews" });
  return pageMetadata({ locale, path: "/reviews", title: t("title"), description: t("lead") });
}

/** Every published customer review on one page, newest first (D-112). */
export default async function AllReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 1000) : 1;
  const [t, tr, { distribution, list }] = await Promise.all([
    getTranslations("allReviews"),
    getTranslations("reviews"),
    getAllReviews(page, locale),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:py-10">
      <SectionTitle as="h1" lead={t("lead")}>
        {t("title")}
      </SectionTitle>

      {distribution.total === 0 || distribution.average === null ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-card p-5 text-sm">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">{tr("emptyTitle")}</p>
            <p className="text-muted-foreground">{t("emptyBody")}</p>
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
                label={tr("averageLabel", { rating: distribution.average.toFixed(1) })}
                className="justify-center"
              />
              <p className="text-sm text-muted-foreground">{tr("count", { count: distribution.total })}</p>
            </div>
            <ul className="grid gap-1.5" aria-label={tr("distributionLabel")}>
              {distribution.rows.map((row) => (
                <li key={row.stars} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{tr("starsShort", { count: row.stars })}</span>
                  <span
                    className="h-2.5 overflow-hidden rounded-full bg-secondary"
                    role="img"
                    aria-label={tr("barLabel", { stars: row.stars, count: row.count, percent: row.percent })}
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

          <ul className="grid gap-4 md:grid-cols-2">
            {list.reviews.map((review) => (
              <li key={review.id} className="space-y-1.5">
                <p className="truncate px-1 text-xs font-medium text-muted-foreground">
                  {review.subjectName && review.subjectHref ? (
                    <Link href={review.subjectHref} className="text-primary hover:underline">
                      {review.subjectName}
                    </Link>
                  ) : (
                    t(`services.${review.service}`)
                  )}
                </p>
                <ReviewCard review={review} verifiedLabel={tr(`verified.${reviewNoun(review.service)}`)} />
              </li>
            ))}
          </ul>

          {list.pages > 1 ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link
                  href={page === 2 ? "/reviews" : `/reviews?page=${page - 1}`}
                  className="inline-flex h-11 items-center gap-1 rounded-xl border bg-card px-4 text-sm font-medium hover:bg-accent"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" /> {t("newer")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                {t("pageOf", { page: list.page, pages: list.pages })}
              </span>
              {page < list.pages ? (
                <Link
                  href={`/reviews?page=${page + 1}`}
                  className="inline-flex h-11 items-center gap-1 rounded-xl border bg-card px-4 text-sm font-medium hover:bg-accent"
                >
                  {t("older")} <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
