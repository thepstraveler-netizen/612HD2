import { Car, Compass, Heart, Home as HomeIcon, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { TempleSkyline } from "@/components/shared/motifs";
import { SectionTitle } from "@/components/shared/section-title";
import { ServiceCard } from "@/components/shared/service-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { SERVICES } from "@/lib/services";

const PILLARS = [
  { key: "travel", icon: Compass },
  { key: "stay", icon: HomeIcon },
  { key: "local", icon: Car },
  { key: "serving", icon: Heart },
] as const;

/**
 * Phase 1 home: brand hero, pillars, about and the services grid. Phase 2
 * replaces the copy with CMS sections and adds the tabbed search card,
 * offers carousel and featured listings.
 */
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-sky to-background pb-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-12 sm:pt-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-5">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
              <MapPin className="size-4" aria-hidden="true" />
              {t("brand.location")} · <span className="font-script text-base">{t("brand.locationTag")}</span>
            </p>
            <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight">
              {t("brand.hero")}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("home.heroLead")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#services">{t("home.ctaExplore")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/partner">{t("home.ctaPartner")}</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="font-script text-3xl leading-snug text-primary">{t("brand.tagline")}</p>
            <p className="mt-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {t("brand.strapline")}
            </p>
          </div>
        </div>
        <TempleSkyline className="absolute bottom-0 h-16 text-brand-navy/10 dark:text-white/5" />
      </section>

      <section aria-labelledby="pillars" className="relative z-10 mx-auto -mt-10 max-w-7xl px-4">
        <h2 id="pillars" className="sr-only">
          {t("home.pillarsTitle")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-4">
          {PILLARS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex flex-col items-center gap-2 p-2 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-brand-navy text-white">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-heading">{t(`home.pillars.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="about" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16">
        <SectionTitle lead={t("home.about")}>{t("home.aboutTitle")}</SectionTitle>
      </section>

      <section id="services" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16">
        <SectionTitle lead={t("home.servicesLead")}>{t("home.servicesTitle")}</SectionTitle>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <li key={service.slug}>
              <ServiceCard
                service={service}
                name={t(`services.${service.slug}.name`)}
                description={t(`services.${service.slug}.description`)}
                cta={service.kind === "bookable" ? t("home.bookable") : t("home.enquiry")}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16">
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-brand-navy p-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="font-script text-3xl !text-white">{t("home.partnerTitle")}</h2>
            <p className="max-w-2xl text-white/80">{t("home.partnerLead")}</p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link href="/partner">{t("home.ctaPartner")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
