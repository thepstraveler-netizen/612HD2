import { CalendarDays, MapPin, Sparkles, Star } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { PeacockFeather, TempleSkyline } from "@/components/shared/motifs";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import type { PackageSummary } from "@/lib/packages/types";
import { formatTourDate, packageAction } from "@/lib/packages/ui";
import { cn } from "@/lib/utils";

/** Photo, or a drawn placeholder (temple skyline and a peacock feather) when the package has none. */
export function PackageImage({
  src,
  priority,
  sizes,
  className,
}: {
  src: string | null;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-brand-sky to-secondary", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes={sizes} className="object-cover" priority={priority} />
      ) : (
        <>
          <PeacockFeather className="absolute end-4 top-3 h-24 text-brand-navy/30 dark:text-white/20" />
          <TempleSkyline className="absolute inset-x-0 bottom-0 h-1/3 text-brand-navy/15 dark:text-white/10" />
        </>
      )}
    </div>
  );
}

/** "3 days · 2 nights" */
export function DurationText({ days, nights }: { days: number; nights: number }) {
  const t = useTranslations("packages");
  return <>{t("duration", { days, nights })}</>;
}

/** One tour in the listing. */
export function PackageCard({
  pkg,
  locale,
  bookingOpen,
  categoryLabel,
  priority,
}: {
  pkg: PackageSummary;
  locale: string;
  bookingOpen: boolean;
  categoryLabel: string;
  priority?: boolean;
}) {
  const t = useTranslations("packages.card");
  const title = pickLocalized(pkg.title, locale);
  const action = packageAction(pkg.bookingMode, bookingOpen);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md">
      <div className="relative">
        <PackageImage
          src={pkg.imageUrl}
          priority={priority}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/10]"
        />
        <div className="absolute start-2 top-2 flex flex-wrap gap-1.5">
          {pkg.isFeatured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-orange px-2.5 py-0.5 text-xs font-bold text-white">
              <Sparkles className="size-3" aria-hidden="true" /> {t("featured")}
            </span>
          ) : null}
          <span className="rounded-full bg-card/95 px-2.5 py-0.5 text-xs font-medium text-foreground">
            {categoryLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold text-primary">
          <DurationText days={pkg.days} nights={pkg.nights} />
        </p>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg leading-snug font-bold">
            <Link
              href={`/packages/${pkg.slug}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {title}
            </Link>
          </h2>
          {pkg.rating !== null ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-accent-green px-1.5 py-0.5 text-xs font-bold text-white"
              aria-label={t("rating", { rating: pkg.rating.toFixed(1) })}
            >
              {pkg.rating.toFixed(1)} <Star className="size-3 fill-current" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        {pkg.destinations.length ? (
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{pkg.destinations.join(" · ")}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          {!pkg.fixedDepartures
            ? t("anyDate")
            : pkg.nextDeparture
              ? t("nextDeparture", { date: formatTourDate(pkg.nextDeparture, locale) })
              : t("datesOnRequest")}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
          <div>
            {pkg.fromPaise !== null ? (
              <>
                <p className="text-xs text-muted-foreground">{t("from")}</p>
                <p className="text-xl font-extrabold">{formatPaise(pkg.fromPaise, locale)}</p>
                <p className="text-xs text-muted-foreground">{t("perPerson")}</p>
              </>
            ) : (
              <p className="text-sm font-semibold">{t("priceOnRequest")}</p>
            )}
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              action === "book"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {action === "book" ? t("bookOnline") : t("enquire")}
          </span>
        </div>
      </div>
    </article>
  );
}
