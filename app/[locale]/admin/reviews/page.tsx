import { Camera, MessageSquareReply, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminReviews } from "@/lib/reviews/admin-queries";
import {
  ADMIN_REVIEWS_PAGE_SIZE,
  formatReviewDate,
  reviewFiltersQuery,
  reviewStatusTone,
} from "@/lib/reviews/ui";
import { REVIEW_STATUSES, REVIEW_SUBJECTS, reviewFiltersSchema } from "@/schemas/reviews";

/**
 * Admin → Reviews: the moderation queue (pending, oldest first) and every
 * other review, filtered and paged in the database, filters in the URL.
 */
export default async function AdminReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requirePermission("reviews.read", "/admin/reviews");
  const filters = reviewFiltersSchema.parse(await searchParams);
  const [t, list] = await Promise.all([getTranslations("reviewsAdmin"), listAdminReviews(filters, locale)]);
  const pages = Math.max(1, Math.ceil(list.total / ADMIN_REVIEWS_PAGE_SIZE));
  const tr = await getTranslations("reviews");

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")}>
        {list.pending > 0 ? (
          <p className="text-sm font-medium">
            <Link
              href={`/admin/reviews${reviewFiltersQuery(filters, { status: "pending", page: 1 })}`}
              className="inline-flex min-h-10 items-center rounded-full bg-accent-amber/15 px-4 hover:bg-accent-amber/25"
            >
              {t("pendingCount", { count: list.pending })}
            </Link>
          </p>
        ) : null}
      </AdminPageHeader>

      <form
        method="get"
        role="search"
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="rf-q">{t("filters.search")}</Label>
          <Input
            id="rf-q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("filters.searchPlaceholder")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-status">{t("filters.status")}</Label>
          <NativeSelect id="rf-status" name="status" defaultValue={filters.status}>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
            <option value="all">{t("filters.all")}</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-subject">{t("filters.subject")}</Label>
          <NativeSelect id="rf-subject" name="subject" defaultValue={filters.subject}>
            <option value="all">{t("filters.all")}</option>
            {REVIEW_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {t(`subjects.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-rating">{t("filters.rating")}</Label>
          <NativeSelect
            id="rf-rating"
            name="rating"
            defaultValue={filters.rating ? String(filters.rating) : ""}
          >
            <option value="">{t("filters.anyRating")}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {tr("starsShort", { count: n })}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">
            <Search /> {t("filters.apply")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/reviews">{t("filters.reset")}</Link>
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("results", { count: list.total })}
      </p>

      {list.rows.length ? (
        <ul className="grid gap-3">
          {list.rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/reviews/${r.id}`}
                className="grid gap-2 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} label={tr("starsLabel", { rating: r.rating })} />
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {t(`subjects.${r.subject_type}`)}
                    </span>
                    <span className="truncate font-semibold">
                      {r.subjectName ?? t(`services.${r.service}`)}
                    </span>
                  </div>
                  {r.title ? <p className="font-medium">{r.title}</p> : null}
                  {r.body ? <p className="line-clamp-2 text-sm text-muted-foreground">{r.body}</p> : null}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{r.author_name}</span>
                    <time dateTime={r.created_at}>{formatReviewDate(r.created_at, locale)}</time>
                    {r.photoCount ? (
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-3.5" aria-hidden="true" />{" "}
                        {t("photoCount", { count: r.photoCount })}
                      </span>
                    ) : null}
                    {r.reply ? (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareReply className="size-3.5" aria-hidden="true" /> {t("replied")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <ToneBadge
                  tone={reviewStatusTone(r.status)}
                  label={t(`status.${r.status}`)}
                  className="self-start"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Search} title={t("empty")} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t("pagination.label")}>
          <span className="text-muted-foreground">{t("pagination.page", { page: filters.page, pages })}</span>
          {filters.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/admin/reviews${reviewFiltersQuery(filters, { page: filters.page - 1 })}`}>
                {t("pagination.prev")}
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline">
              <Link href={`/admin/reviews${reviewFiltersQuery(filters, { page: filters.page + 1 })}`}>
                {t("pagination.next")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
