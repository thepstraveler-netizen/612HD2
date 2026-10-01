import { ArrowLeft, Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqList } from "@/components/home/faq-list";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getFaqs, getService, getServices } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
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

/**
 * Service landing page, fully CMS-driven. Each vertical's booking flow
 * (hotels in phase 3, cabs in phase 5, …) or enquiry form (phase 8–9) is
 * added below the overview by its own phase.
 */
export default async function ServicePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const service = await getService(slug);
  if (!service) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const faqs = await getFaqs(service.id);
  const accent = ACCENT_CLASSES[service.accent];
  const Icon = getIcon(service.icon);
  const description = service.description ? pickLocalized(service.description, locale) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
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

      <p className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
        {t("servicePage.comingSoon")}
      </p>

      {faqs.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">{t("faq.title")}</h2>
          <FaqList faqs={faqs} locale={locale} />
        </section>
      ) : null}
    </div>
  );
}
