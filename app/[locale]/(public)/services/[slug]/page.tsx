import { ArrowLeft, Check, ChevronRight, Map as MapIcon, Plane } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqList } from "@/components/home/faq-list";
import { EnquiryForm } from "@/components/leads/enquiry-form";
import { PortfolioGallery } from "@/components/services/portfolio-gallery";
import { ServicePlans } from "@/components/services/service-plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getServicePlans, getServicePortfolio } from "@/lib/catalog/b2b";
import { planOptionLabel, serviceJsonLd } from "@/lib/catalog/b2b-ui";
import { getBusinessInfo, getFaqs, getService, getServices } from "@/lib/catalog/queries";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
import { getRideCatalog } from "@/lib/rides/queries";
import { ACCENT_CLASSES } from "@/lib/services";
import { cn } from "@/lib/utils";

type Params = Promise<{ locale: string; slug: string }>;

export const revalidate = 3600;

export async function generateStaticParams() {
  const services = await getServices();
  return routing.locales.flatMap((locale) => services.map((s) => ({ locale, slug: s.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const service = await getService(slug);
  if (!service) return {};
  return { title: pickLocalized(service.name, locale), description: pickLocalized(service.summary, locale) };
}

/** Travel services hand over to their own pages: tour packages and flight / train / bus enquiries. */
const TRAVEL_CTAS: Record<string, ("packages" | "travel")[]> = {
  "travel-hotel-booking": ["packages", "travel"],
  "travel-agent": ["travel", "packages"],
};

/**
 * Service landing page, fully CMS-driven. Each vertical's booking flow
 * (hotels in phase 3, cabs in phase 5, …) is linked below the overview;
 * enquiry-only services get the shared enquiry form (phase 8). B2B services
 * add admin-edited plans (pricing cards that preselect a plan in the form)
 * and a portfolio gallery (phase 9); both show only when they have rows.
 */
export default async function ServicePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const service = await getService(slug);
  if (!service) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const [faqs, rideCatalog, plans, portfolio] = await Promise.all([
    getFaqs(service.id),
    getRideCatalog(),
    getServicePlans(service.id),
    getServicePortfolio(service.id),
  ]);
  // Bike, rickshaw and car pages link to the ride booking for their vehicle type.
  const rideType = rideCatalog.types.find((type) => type.serviceSlug === service.slug);
  const accent = ACCENT_CLASSES[service.accent];
  const Icon = getIcon(service.icon);
  const description = service.description ? pickLocalized(service.description, locale) : null;
  const travelCtas = TRAVEL_CTAS[service.slug];
  const lang = locale === "hi" ? "hi" : "en";
  // Enquiry services get the form; a travel hand-off page keeps it only when it sells plans.
  const showEnquiry = service.kind === "enquiry" && !rideType && (!travelCtas || plans.length > 0);
  const jsonLd = plans.length
    ? serviceJsonLd({
        name: pickLocalized(service.name, locale),
        description: pickLocalized(service.summary, locale),
        providerName: (await getBusinessInfo()).name,
        plans,
        locale,
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <Link
        href="/services"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("servicePage.back")}
      </Link>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {service.heroImage ? (
          <div className="relative aspect-[16/7]">
            <Image
              src={service.heroImage}
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 48rem, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="flex items-start gap-4 p-6">
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-full ring-4",
              accent.badge,
              accent.ring,
            )}
          >
            <Icon className="size-7" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <Badge variant="secondary">
              {service.kind === "bookable" ? t("servicePage.kindBookable") : t("servicePage.kindEnquiry")}
            </Badge>
            <h1 className="text-[length:var(--text-title)] font-bold">
              {pickLocalized(service.name, locale)}
            </h1>
            <p className="text-muted-foreground">{pickLocalized(service.summary, locale)}</p>
          </div>
        </div>
      </div>

      {description ? <p className="leading-relaxed whitespace-pre-line">{description}</p> : null}

      {service.highlights.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {service.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
              <Check className={cn("mt-0.5 size-4 shrink-0", accent.text)} aria-hidden="true" />
              {pickLocalized(h, locale)}
            </li>
          ))}
        </ul>
      ) : null}

      {rideType ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-bold">{t("rides.serviceCta.title")}</p>
            <p className="text-sm text-muted-foreground">{t("rides.serviceCta.body")}</p>
          </div>
          <Button asChild size="lg">
            <Link href={{ pathname: "/rides", query: { v: rideType.key } }}>
              {t("rides.serviceCta.button")} <ChevronRight />
            </Link>
          </Button>
        </div>
      ) : travelCtas ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {travelCtas.map((key, i) => {
            const CtaIcon = key === "packages" ? MapIcon : Plane;
            return (
              <li key={key} className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-4">
                <div>
                  <p className="flex items-center gap-2 font-bold">
                    <CtaIcon className={cn("size-5", accent.text)} aria-hidden="true" />
                    {t(`enquiry.serviceCta.${key}.title`)}
                  </p>
                  <p className="text-sm text-muted-foreground">{t(`enquiry.serviceCta.${key}.body`)}</p>
                </div>
                <Button asChild size="lg" variant={i === 0 ? "default" : "outline"}>
                  <Link href={key === "packages" ? "/packages" : "/travel"}>
                    {t(`enquiry.serviceCta.${key}.button`)} <ChevronRight />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {plans.length ? (
        <ServicePlans
          plans={plans}
          locale={locale}
          enquiryId={showEnquiry ? "enquire" : null}
          accentText={accent.text}
        />
      ) : null}

      {portfolio.length ? (
        <section aria-labelledby="service-portfolio" className="space-y-4">
          <div>
            <h2 id="service-portfolio" className="text-xl font-bold">
              {t("servicePage.portfolio.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("servicePage.portfolio.lead")}</p>
          </div>
          <PortfolioGallery items={portfolio} locale={locale} />
        </section>
      ) : null}

      {showEnquiry ? (
        <section id="enquire" aria-labelledby="service-enquiry" className="scroll-mt-20 space-y-3">
          <div>
            <h2 id="service-enquiry" className="text-xl font-bold">
              {t("enquiry.serviceTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("enquiry.serviceBody")}</p>
          </div>
          <EnquiryForm
            target={{ kind: "service", serviceSlug: service.slug }}
            locale={lang}
            minDate={todayInIndia()}
            plans={plans.map((p) => ({ id: p.id, label: planOptionLabel(p, locale) }))}
          />
        </section>
      ) : rideType || travelCtas ? null : (
        <p className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
          {t("servicePage.comingSoon")}
        </p>
      )}

      {faqs.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">{t("faq.title")}</h2>
          <FaqList faqs={faqs} locale={locale} />
        </section>
      ) : null}
    </div>
  );
}
