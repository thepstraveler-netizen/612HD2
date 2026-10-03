import { ArrowRight, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ReviewModeration, ReviewReplyForm } from "@/components/admin/review-actions";
import { DetailCard, FactList, whenFormatter } from "@/components/admin/vendor-shared";
import { PhotoStrip } from "@/components/reviews/review-list";
import { Stars } from "@/components/reviews/stars";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/check";
import { getAdminReview } from "@/lib/reviews/admin-queries";
import { reviewStatusTone } from "@/lib/reviews/ui";

const LIST = "/admin/reviews";

/** One review: what the customer wrote, the booking behind it, moderation and the public reply. */
export default async function AdminReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: raw } = await params;
  const { id } = parseEditId(raw);
  if (!id) notFound();
  const session = await requirePermission("reviews.read", `${LIST}/${raw}`);
  const canWrite = hasPermission(session.permissions, "reviews.write");
  const canSeeBooking = hasPermission(session.permissions, "bookings.read");
  const [t, tr, found, when] = await Promise.all([
    getTranslations("reviewsAdmin"),
    getTranslations("reviews"),
    getAdminReview(id, locale),
    whenFormatter(),
  ]);
  if (!found) notFound();
  const { review, booking } = found;
  const subject = found.subjectName ?? t(`services.${review.service}`);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={subject}
        lead={`${t(`subjects.${review.subject_type}`)} · ${review.author_name}`}
        backHref={LIST}
        backLabel={t("title")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={reviewStatusTone(review.status)} label={t(`status.${review.status}`)} />
          {found.subjectSlug && review.status === "published" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`${found.subjectSlug}#reviews`} target="_blank">
                {t("viewOnSite")} <ExternalLink />
              </Link>
            </Button>
          ) : null}
        </div>
        {canWrite ? <ReviewModeration id={review.id} status={review.status} /> : null}
      </AdminPageHeader>

      {review.moderated_at ? (
        <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
          <p className="font-medium">
            {t("moderated", {
              status: t(`status.${review.status}`),
              who: found.moderator ?? "–",
              when: when(review.moderated_at),
            })}
          </p>
          {review.moderation_note ? (
            <p className="mt-1 whitespace-pre-line">{review.moderation_note}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <DetailCard title={t("detail.review")}>
          <Stars rating={review.rating} label={tr("starsLabel", { rating: review.rating })} size="size-5" />
          {review.title ? <h2 className="text-lg font-bold">{review.title}</h2> : null}
          {review.body ? (
            <p className="text-sm leading-relaxed whitespace-pre-line" lang={review.locale}>
              {review.body}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noText")}</p>
          )}
          {found.photos.length ? (
            <PhotoStrip
              photos={found.photos.map((p) => p.url).filter((u): u is string => !!u)}
              label={t("detail.photos")}
            />
          ) : null}
        </DetailCard>

        <DetailCard title={t("detail.booking")}>
          <FactList
            items={[
              { label: t("detail.author"), value: found.author?.name || review.author_name },
              { label: t("detail.email"), value: found.author?.email ?? "" },
              { label: t("detail.publicName"), value: review.author_name },
              { label: t("detail.language"), value: review.locale === "hi" ? "हिन्दी" : "English" },
              { label: t("detail.written"), value: when(review.created_at) },
              { label: t("detail.service"), value: t(`services.${review.service}`) },
              { label: t("detail.bookingCode"), value: booking?.code ?? "" },
              { label: t("detail.guest"), value: booking?.contactName ?? "" },
            ]}
          />
          {booking && canSeeBooking ? (
            <Button asChild variant="outline" className="justify-self-start">
              <Link href={`/admin/bookings/${booking.id}`}>
                {t("detail.openBooking", { code: booking.code })} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </DetailCard>
      </div>

      <DetailCard title={t("detail.replyTitle")}>
        {review.reply && review.replied_at ? (
          <p className="text-xs text-muted-foreground">
            {t("detail.repliedBy", { who: found.replier ?? "–", when: when(review.replied_at) })}
          </p>
        ) : null}
        {canWrite ? (
          <ReviewReplyForm id={review.id} reply={review.reply} />
        ) : review.reply ? (
          <p className="text-sm whitespace-pre-line">{review.reply}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("detail.noReply")}</p>
        )}
      </DetailCard>
    </div>
  );
}
