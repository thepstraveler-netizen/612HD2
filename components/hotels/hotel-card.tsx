import { BadgeCheck, Coffee, Heart, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { WishlistButton } from "@/components/wishlist/wishlist-button";
import { Link } from "@/i18n/navigation";
import { offersFreeCancellation } from "@/lib/availability/engine";
import type { HotelResult } from "@/lib/hotels/search";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { PhotoCarousel } from "./photo-carousel";
import { RatingBadge, StarRow } from "./rating";

export function formatDistance(
  m: number,
  t: (key: string, values: Record<string, number>) => string,
): string {
  return m < 1000
    ? t("distanceM", { m: Math.round(m / 10) * 10 })
    : t("distanceKm", { km: Math.round(m / 100) / 10 });
}

/** One search result: photos, name, location, tags and the price for the stay. */
export async function HotelCard({
  result,
  locale,
  query,
  place,
  landmarkName,
  priority,
}: {
  result: HotelResult;
  locale: string;
  query: Record<string, string>;
  place: string;
  landmarkName: string | null;
  priority?: boolean;
}) {
  const t = await getTranslations("hotels");
  const { hotel, offer, unavailable, displayPaise, distanceM } = result;
  const name = pickLocalized(hotel.name, locale);
  const hasBreakfast = hotel.plans.some((p) => p.isActive && p.mealPlan !== "room_only");
  const freeCancel = offer
    ? offer.freeCancellation
    : hotel.plans.some((p) => p.isActive && offersFreeCancellation(p));
  const href = { pathname: `/hotels/${hotel.slug}` as const, query };
  const nights = offer?.nights.length ?? 0;

  return (
    <article className="relative grid overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md sm:grid-cols-[minmax(0,18rem)_1fr]">
      <PhotoCarousel
        images={hotel.images
          .filter((i) => !i.roomId)
          .slice(0, 8)
          .map((i) => ({ url: i.url, alt: i.alt ? pickLocalized(i.alt, locale) : name }))}
        sizes="(min-width: 640px) 18rem, 100vw"
        className="aspect-[16/10] sm:aspect-auto sm:min-h-56"
        priority={priority}
      />
      <WishlistButton type="hotel" id={hotel.id} name={name} className="absolute start-2 top-2" />
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {hotel.isSponsored ? <Badge variant="outline">{t("card.sponsored")}</Badge> : null}
            {hotel.isFeatured ? (
              <Badge variant="secondary">
                <BadgeCheck /> {t("card.featured")}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{t(`propertyTypes.${hotel.propertyType}`)}</span>
            {hotel.starRating > 0 ? (
              <StarRow count={hotel.starRating} label={t("card.stars", { count: hotel.starRating })} />
            ) : null}
          </div>
          <h2 className="text-lg leading-snug font-bold">
            <Link href={href} className="hover:underline">
              {name}
            </Link>
          </h2>
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {place}
              {distanceM !== null && landmarkName ? (
                <>
                  {" "}
                  ·{" "}
                  {t("card.fromLandmark", { distance: formatDistance(distanceM, t), landmark: landmarkName })}
                </>
              ) : null}
            </span>
          </p>
          {hotel.summary ? (
            <p className="line-clamp-2 text-sm">{pickLocalized(hotel.summary, locale)}</p>
          ) : null}
          <ul className="flex flex-wrap gap-2 text-xs">
            {hotel.isCoupleFriendly ? (
              <li className="inline-flex items-center gap-1 rounded-full bg-accent-pink/10 px-2 py-1 text-accent-pink">
                <Heart className="size-3" aria-hidden="true" /> {t("card.coupleFriendly")}
              </li>
            ) : null}
            {freeCancel ? (
              <li className="rounded-full bg-accent-green/10 px-2 py-1 text-accent-green">
                {t("card.freeCancellation")}
              </li>
            ) : null}
            {hasBreakfast ? (
              <li className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
                <Coffee className="size-3" aria-hidden="true" /> {t("card.breakfastAvailable")}
              </li>
            ) : null}
          </ul>
        </div>

        <div className="flex flex-row items-end justify-between gap-3 border-t pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0 sm:text-right">
          {hotel.ratingAvg !== null && hotel.ratingCount > 0 ? (
            <RatingBadge rating={hotel.ratingAvg} count={hotel.ratingCount} />
          ) : (
            <span />
          )}
          <div className="space-y-0.5">
            {unavailable ? (
              <p className="text-sm font-semibold text-destructive">{t(`unavailable.${unavailable}`)}</p>
            ) : null}
            {displayPaise !== null ? (
              <>
                {!offer ? <p className="text-xs text-muted-foreground">{t("card.from")}</p> : null}
                <p className="text-2xl font-extrabold text-heading">{formatPaise(displayPaise, locale)}</p>
                <p className="text-xs text-muted-foreground">{t("card.perNight")}</p>
                {offer ? (
                  <p className="text-xs text-muted-foreground">
                    {offer.taxPaise > 0 ? (
                      <>
                        {t("card.taxes", { tax: formatPaise(offer.taxPaise, locale) })}
                        <br />
                      </>
                    ) : null}
                    {t("card.total", { total: formatPaise(offer.totalPaise, locale), nights })}
                  </p>
                ) : null}
                {offer && offer.unitsLeft <= 3 ? (
                  <p className="text-xs font-semibold text-accent-orange">
                    {t("card.fewLeft", { count: offer.unitsLeft })}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
