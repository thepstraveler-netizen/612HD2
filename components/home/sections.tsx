import { ArrowRight, Check, MapPin, Star } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SectionTitle } from "@/components/shared/section-title";
import { ServiceCard } from "@/components/shared/service-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Banner, CatalogService, Faq, HomeSection, Testimonial } from "@/lib/catalog/types";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { getIcon } from "@/lib/icons";
import { sectionContentSchemas } from "@/schemas/cms";
import { FaqList } from "./faq-list";
import { OffersCarousel } from "./offers-carousel";
import { SearchCard } from "./search-card";

export type FeaturedHotel = {
  slug: string;
  name: LocalizedJson;
  place: string;
  image: string | null;
  fromPaise: number | null;
  ratingAvg: number | null;
};

export type HomeData = {
  locale: string;
  featuredHotels: FeaturedHotel[];
  services: CatalogService[];
  banners: Banner[];
  testimonials: Testimonial[];
  faqs: Faq[];
};

/**
 * Renders one CMS section. Content JSON is validated with the section's zod
 * schema; a section with invalid content is skipped rather than breaking
 * the page.
 */
export async function HomeSectionView({ section, data }: { section: HomeSection; data: HomeData }) {
  const { locale } = data;
  const title = pickLocalized(section.title, locale);
  const subtitle = section.subtitle ? pickLocalized(section.subtitle, locale) : undefined;
  const t = await getTranslations();

  switch (section.type) {
    case "hero": {
      const content = sectionContentSchemas.hero.safeParse(section.content);
      const tagline =
        content.success && content.data.tagline ? pickLocalized(content.data.tagline, locale) : null;
      return (
        <section className="relative isolate overflow-hidden pb-20">
          {/* Prem Mandir at sunset; darkened at the top for the text, fading into the page below. */}
          <Image
            src="/images/home-hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-[70%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/65 via-black/40 to-background"
          />
          <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:space-y-8 sm:pt-14">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
              <div className="space-y-3 sm:space-y-4">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
                  <MapPin className="size-4" aria-hidden="true" />
                  {t("brand.location")} ·{" "}
                  <span className="font-script text-base">{t("brand.locationTag")}</span>
                </p>
                <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight !text-white drop-shadow-md">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="max-w-xl text-base text-white/90 drop-shadow sm:text-lg">{subtitle}</p>
                ) : null}
              </div>
              {tagline ? (
                <p className="font-script text-xl leading-snug text-amber-100 drop-shadow-md sm:text-2xl lg:text-right lg:text-3xl">
                  {tagline}
                </p>
              ) : null}
            </div>
            <SearchCard tabs={content.success ? content.data.search_tabs : []} />
          </div>
        </section>
      );
    }

    case "pillars": {
      const content = sectionContentSchemas.pillars.safeParse(section.content);
      if (!content.success || content.data.items.length === 0) return null;
      return (
        <section aria-label={t("home.pillarsTitle")} className="relative z-10 mx-auto -mt-10 max-w-7xl px-4">
          <ul className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-4">
            {content.data.items.map((item, i) => {
              const Icon = getIcon(item.icon);
              return (
                <li key={i} className="flex flex-col items-center gap-2 p-2 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-brand-navy text-white">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-heading">
                    {pickLocalized(item.label, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      );
    }

    case "about": {
      const content = sectionContentSchemas.about.safeParse(section.content);
      if (!content.success) return null;
      return (
        <section id="about" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16">
          <SectionTitle lead={pickLocalized(content.data.body, locale)}>{title}</SectionTitle>
        </section>
      );
    }

    case "services":
      if (data.services.length === 0) return null;
      return (
        <section id="services" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16">
          <SectionTitle lead={subtitle}>{title}</SectionTitle>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-3">
            {data.services.map((service) => (
              <li key={service.id}>
                <ServiceCard
                  service={service}
                  locale={locale}
                  cta={service.kind === "bookable" ? t("home.bookable") : t("home.enquiry")}
                />
              </li>
            ))}
          </ul>
        </section>
      );

    case "offers":
      if (data.banners.length === 0) return null;
      return (
        <section className="mx-auto max-w-7xl px-4 pt-16">
          <SectionTitle lead={subtitle}>{title}</SectionTitle>
          <div className="mt-6">
            <OffersCarousel
              banners={data.banners.map((banner) => ({
                ...banner,
                title: pickLocalized(banner.title, locale),
                subtitle: banner.subtitle ? pickLocalized(banner.subtitle, locale) : null,
                ctaLabel: banner.ctaLabel ? pickLocalized(banner.ctaLabel, locale) : null,
              }))}
            />
          </div>
        </section>
      );

    case "testimonials":
      if (data.testimonials.length === 0) return null;
      return (
        <section className="mx-auto max-w-7xl px-4 pt-16">
          <SectionTitle lead={subtitle}>{title}</SectionTitle>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {data.testimonials.map((item) => (
              <li key={item.id}>
                <figure className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
                  <div
                    className="flex gap-0.5"
                    role="img"
                    aria-label={t("testimonials.rating", { rating: item.rating })}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={
                          i < item.rating
                            ? "size-4 fill-accent-amber text-accent-amber"
                            : "size-4 text-muted-foreground/40"
                        }
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <blockquote className="flex-1 text-sm leading-relaxed">
                    “{pickLocalized(item.quote, locale)}”
                  </blockquote>
                  <figcaption className="text-sm">
                    <span className="font-semibold text-heading">{item.authorName}</span>
                    {item.authorPlace ? (
                      <span className="text-muted-foreground"> · {item.authorPlace}</span>
                    ) : null}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      );

    case "why_collaborate": {
      const content = sectionContentSchemas.why_collaborate.safeParse(section.content);
      if (!content.success) return null;
      return (
        <section className="mx-auto max-w-7xl px-4 pt-16">
          <SectionTitle lead={subtitle}>{title}</SectionTitle>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">{t("collaborate.openTo")}</h3>
              <ul className="grid gap-2">
                {content.data.partner_types.map((type, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-accent-green" aria-hidden="true" />
                    {pickLocalized(type, locale)}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="grid gap-3">
              {content.data.points.map((point, i) => {
                const Icon = getIcon(point.icon);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium">{pickLocalized(point.text, locale)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      );
    }

    case "partner_cta": {
      const content = sectionContentSchemas.partner_cta.safeParse(section.content);
      if (!content.success) return null;
      return (
        <section className="mx-auto max-w-7xl px-4 pt-16">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-brand-navy p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="space-y-1">
              <h2 className="font-script text-3xl !text-white">{title}</h2>
              {subtitle ? <p className="max-w-2xl text-white/80">{subtitle}</p> : null}
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link href={content.data.href}>{pickLocalized(content.data.cta_label, locale)}</Link>
            </Button>
          </div>
        </section>
      );
    }

    case "featured_hotels": {
      const content = sectionContentSchemas.featured_hotels.safeParse(section.content);
      const hotels = data.featuredHotels.slice(0, content.success ? content.data.limit : 6);
      if (hotels.length === 0) return null;
      return (
        <section className="mx-auto max-w-7xl px-4 pt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle lead={subtitle}>{title}</SectionTitle>
            <Button asChild variant="outline">
              <Link href="/hotels">
                {t("home.allHotels")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hotels.map((hotel) => (
              <li key={hotel.slug}>
                <Link
                  href={`/hotels/${hotel.slug}`}
                  className="group block overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md"
                >
                  <div className="relative aspect-[16/10] bg-muted">
                    {hotel.image ? (
                      <Image
                        src={hotel.image}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : null}
                    {hotel.ratingAvg !== null ? (
                      <span className="absolute top-3 right-3 rounded-lg bg-brand-navy px-2 py-0.5 text-sm font-bold text-white">
                        {hotel.ratingAvg.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-end justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-heading">
                        {pickLocalized(hotel.name, locale)}
                      </p>
                      <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" /> {hotel.place}
                      </p>
                    </div>
                    {hotel.fromPaise !== null ? (
                      <p className="shrink-0 text-right text-xs text-muted-foreground">
                        {t("hotels.card.from")}
                        <br />
                        <span className="text-base font-bold text-heading">
                          {formatPaise(hotel.fromPaise, locale)}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "faqs":
      if (data.faqs.length === 0) return null;
      return (
        <section className="mx-auto max-w-3xl px-4 pt-16">
          <SectionTitle lead={subtitle}>{title || t("faq.title")}</SectionTitle>
          <FaqList faqs={data.faqs} locale={locale} className="mt-6" />
        </section>
      );
  }
}
