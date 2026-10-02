import {
  ArrowLeft,
  CalendarDays,
  Check,
  Coffee,
  MapPin,
  MessageCircle,
  Moon,
  Plus,
  ShieldCheck,
  Star,
  Users,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HotelGallery } from "@/components/hotels/hotel-gallery";
import { EnquiryForm } from "@/components/leads/enquiry-form";
import { PackageBookingWidget } from "@/components/packages/booking-widget";
import { DurationText, PackageImage } from "@/components/packages/package-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { PACKAGE_FLAG } from "@/lib/packages/checkout";
import { getPackage, getPackages, getPackagesSettings } from "@/lib/packages/queries";
import {
  departureRows,
  formatTourDate,
  humanizeSlug,
  packageAction,
  privateTourMinDate,
  sortedTiers,
  travellerLimits,
} from "@/lib/packages/ui";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const revalidate = 60;

export async function generateStaticParams() {
  const packages = await getPackages();
  return routing.locales.flatMap((locale) => packages.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const pkg = await getPackage(slug);
  if (!pkg) return {};
  return {
    title: pickLocalized(pkg.title, locale),
    description: pickLocalized(pkg.summary, locale),
    openGraph: pkg.imageUrl ? { images: [pkg.imageUrl] } : undefined,
  };
}

/**
 * Tour package page: photos, day-wise itinerary, what's included, price
 * per person by group size, departures and policies, with an enquiry form
 * always and the booking widget when the package and the
 * `booking.packages` flag allow online booking.
 */
export default async function PackagePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [pkg, settings, bookingOpen, business] = await Promise.all([
    getPackage(slug),
    getPackagesSettings(),
    getFeatureFlag(PACKAGE_FLAG),
    getBusinessInfo(),
  ]);
  if (!pkg) notFound();
  const t = await getTranslations("packages");
  const td = (key: string, values?: Record<string, string | number>) => t(`detail.${key}`, values);
  const today = todayInIndia();
  const title = pickLocalized(pkg.title, locale);
  const action = packageAction(pkg.bookingMode, bookingOpen);
  const limits = travellerLimits(pkg, settings.max_travellers);
  const minDate = privateTourMinDate(today, settings.book_until_days);
  const departures = departureRows(pkg.departures, 1, today, settings.book_until_days);
  const tiers = sortedTiers(pkg.tiers);
  const hasChildPrice = tiers.some((tier) => tier.childPricePaise !== null);
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "");
  const images = [pkg.imageUrl, ...pkg.gallery]
    .filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i)
    .map((url) => ({ url, alt: title }));
  const categoryLabel = t.has(`categories.${pkg.category}`)
    ? t(`categories.${pkg.category}`)
    : humanizeSlug(pkg.category);
  const money = (paise: number) => formatPaise(paise, locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: title,
    description: pickLocalized(pkg.summary, locale),
    image: images.slice(0, 5).map((i) => i.url),
    touristType: categoryLabel,
    itinerary: {
      "@type": "ItemList",
      itemListElement: pkg.itinerary.map((d) => ({
        "@type": "ListItem",
        position: d.day,
        name: pickLocalized(d.title, locale),
      })),
    },
    offers:
      pkg.fromPaise !== null
        ? { "@type": "Offer", price: pkg.fromPaise / 100, priceCurrency: "INR" }
        : undefined,
  };

  const side = (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-20">
      {pkg.fromPaise !== null ? (
        <div>
          <p className="text-xs text-muted-foreground">{t("card.from")}</p>
          <p className="text-2xl font-extrabold">{money(pkg.fromPaise)}</p>
          <p className="text-xs text-muted-foreground">{td("perPersonPlusGst")}</p>
        </div>
      ) : (
        <p className="font-semibold">{t("card.priceOnRequest")}</p>
      )}
      {action === "book" ? (
        <PackageBookingWidget
          slug={pkg.slug}
          locale={locale}
          fixedDepartures={pkg.fixedDepartures}
          departures={pkg.departures}
          today={today}
          bookUntilDays={settings.book_until_days}
          minDate={minDate}
          limits={limits}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{td("enquiryOnly")}</p>
          <Button asChild size="lg" className="w-full">
            <a href="#enquire">{td("enquireCta")}</a>
          </Button>
        </>
      )}
      {whatsapp ? (
        <Button asChild variant="outline" className="w-full">
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(td("whatsappText", { title }))}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle /> {td("whatsapp")}
          </a>
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link
        href="/packages"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {td("back")}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{categoryLabel}</Badge>
          <span className="font-semibold text-primary">
            <DurationText days={pkg.days} nights={pkg.nights} />
          </span>
          {pkg.rating !== null ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-lg bg-accent-green px-1.5 py-0.5 text-xs font-bold text-white"
              aria-label={t("card.rating", { rating: pkg.rating.toFixed(1) })}
            >
              {pkg.rating.toFixed(1)} <Star className="size-3 fill-current" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{title}</h1>
        {pkg.destinations.length ? (
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {pkg.destinations.join(" · ")}
              {pkg.startCity ? ` · ${td("startsFrom", { city: pkg.startCity })}` : null}
            </span>
          </p>
        ) : null}
      </header>

      {images.length ? (
        <HotelGallery images={images} />
      ) : (
        <PackageImage src={null} sizes="100vw" className="aspect-[16/6] rounded-2xl" />
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <aside aria-label={td("bookingPanel")} className="lg:order-2">
          {side}
        </aside>

        <div className="min-w-0 space-y-10 lg:order-1">
          <section aria-labelledby="about" className="space-y-3">
            <h2 id="about" className="text-xl font-bold">
              {td("about")}
            </h2>
            <p className="font-medium">{pickLocalized(pkg.summary, locale)}</p>
            {pkg.description ? (
              <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                {pickLocalized(pkg.description, locale)}
              </p>
            ) : null}
          </section>

          {pkg.highlights.length ? (
            <section aria-labelledby="highlights" className="space-y-3">
              <h2 id="highlights" className="text-xl font-bold">
                {td("highlights")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {pkg.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
                    {pickLocalized(h, locale)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pkg.itinerary.length ? (
            <section aria-labelledby="itinerary" className="space-y-3">
              <h2 id="itinerary" className="text-xl font-bold">
                {td("itinerary")}
              </h2>
              <ol className="relative space-y-3 border-s-2 border-primary/20 ps-5">
                {pkg.itinerary.map((day, i) => (
                  <li key={day.id} className="relative">
                    <span
                      className="absolute -start-[1.95rem] top-3 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                      aria-hidden="true"
                    >
                      {day.day}
                    </span>
                    <details open={i === 0} className="group rounded-xl border bg-card">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-3 font-semibold [&::-webkit-details-marker]:hidden">
                        <span>
                          <span className="text-xs font-semibold text-primary">
                            {td("day", { day: day.day })}
                          </span>
                          <span className="block">{pickLocalized(day.title, locale)}</span>
                        </span>
                        <Plus
                          className="size-4 shrink-0 transition group-open:rotate-45"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="space-y-2 border-t p-3 text-sm">
                        {day.description ? (
                          <p className="leading-relaxed text-muted-foreground">
                            {pickLocalized(day.description, locale)}
                          </p>
                        ) : null}
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Coffee className="size-3.5 text-primary" aria-hidden="true" />
                            {day.meals.length
                              ? day.meals.map((m) => t(`meals.${m}`)).join(", ")
                              : td("noMeals")}
                          </span>
                          {day.overnight ? (
                            <span className="inline-flex items-center gap-1">
                              <Moon className="size-3.5 text-primary" aria-hidden="true" />
                              {td("overnight", { place: day.overnight })}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {pkg.inclusions.length || pkg.exclusions.length ? (
            <section aria-labelledby="included" className="grid gap-4 sm:grid-cols-2">
              <h2 id="included" className="sr-only">
                {td("includedTitle")}
              </h2>
              {pkg.inclusions.length ? (
                <div className="space-y-2 rounded-2xl border bg-card p-4">
                  <h3 className="font-bold">{td("inclusions")}</h3>
                  <ul className="space-y-1.5 text-sm">
                    {pkg.inclusions.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
                        {pickLocalized(item, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pkg.exclusions.length ? (
                <div className="space-y-2 rounded-2xl border bg-card p-4">
                  <h3 className="font-bold">{td("exclusions")}</h3>
                  <ul className="space-y-1.5 text-sm">
                    {pkg.exclusions.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <X className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
                        {pickLocalized(item, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {tiers.length ? (
            <section aria-labelledby="prices" className="space-y-3">
              <h2 id="prices" className="text-xl font-bold">
                {td("prices")}
              </h2>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-secondary-foreground">
                    <tr>
                      <th scope="col" className="p-3 font-semibold">
                        {td("groupSize")}
                      </th>
                      <th scope="col" className="p-3 text-right font-semibold">
                        {td("adultPrice")}
                      </th>
                      {hasChildPrice ? (
                        <th scope="col" className="p-3 text-right font-semibold">
                          {td("childPrice")}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((tier) => (
                      <tr key={tier.id} className="border-t">
                        <th scope="row" className="p-3 text-left font-medium">
                          <Users className="me-1.5 inline size-4 text-muted-foreground" aria-hidden="true" />
                          {tier.minPax === tier.maxPax
                            ? td("travellersExact", { count: tier.minPax })
                            : td("travellersRange", { min: tier.minPax, max: tier.maxPax })}
                        </th>
                        <td className="p-3 text-right font-semibold">{money(tier.adultPricePaise)}</td>
                        {hasChildPrice ? (
                          <td className="p-3 text-right">
                            {money(tier.childPricePaise ?? tier.adultPricePaise)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {td("pricesNote", { gst: (pkg.taxBps / 100).toString() })}
              </p>
            </section>
          ) : null}

          {pkg.fixedDepartures ? (
            <section aria-labelledby="departures" className="space-y-3">
              <h2 id="departures" className="text-xl font-bold">
                {td("departures")}
              </h2>
              {departures.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {departures.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm"
                    >
                      <span>
                        <span className="flex items-center gap-1.5 font-semibold">
                          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                          {formatTourDate(d.startDate, locale)}
                        </span>
                        {d.supplementPaise > 0 ? (
                          <span className="block text-xs text-muted-foreground">
                            {t("book.supplement", { amount: money(d.supplementPaise) })}
                          </span>
                        ) : null}
                        {d.note ? (
                          <span className="block text-xs text-muted-foreground">
                            {pickLocalized(d.note, locale)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold",
                          d.state === "open" ? "text-accent-green" : "text-accent-orange",
                        )}
                      >
                        {d.state === "sold_out"
                          ? t("book.soldOut")
                          : d.state === "closed"
                            ? t("book.closed")
                            : d.seatsLeft !== null
                              ? t("book.seatsLeft", { count: d.seatsLeft })
                              : t("book.open")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{td("noDepartures")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {td("bookUntil", { days: settings.book_until_days })}
              </p>
            </section>
          ) : (
            <p className="flex items-start gap-2 rounded-2xl border bg-card p-4 text-sm">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {td("anyDateNote", { days: settings.book_until_days })}
            </p>
          )}

          <section aria-labelledby="policy" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
            <h2 id="policy" className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> {td("policy")}
            </h2>
            <p className="whitespace-pre-line">{pickLocalized(settings.cancellation_policy, locale)}</p>
            {pkg.terms ? (
              <>
                <h3 className="pt-2 font-semibold">{td("terms")}</h3>
                <p className="whitespace-pre-line text-muted-foreground">
                  {pickLocalized(pkg.terms, locale)}
                </p>
              </>
            ) : null}
          </section>

          <section id="enquire" aria-labelledby="enquire-title" className="scroll-mt-20 space-y-3">
            <div>
              <h2 id="enquire-title" className="text-xl font-bold">
                {td("enquireTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{td("enquireBody")}</p>
            </div>
            <EnquiryForm
              target={{ kind: "package", packageSlug: pkg.slug }}
              locale={locale === "hi" ? "hi" : "en"}
              minDate={today}
              maxTravellers={settings.max_travellers}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
