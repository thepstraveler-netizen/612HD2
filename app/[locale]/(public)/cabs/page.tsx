import {
  BadgeCheck,
  CalendarCheck,
  Car,
  ChevronRight,
  Clock,
  Headphones,
  IndianRupee,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CabSearchForm } from "@/components/cabs/cab-search-form";
import { TempleSkyline } from "@/components/shared/motifs";
import { Link } from "@/i18n/navigation";
import { cabSearchOptions, popularRoutes } from "@/lib/cabs/page-data";
import { getCabCatalog, getCabSettings } from "@/lib/cabs/queries";
import { freeCancellationHours, splitMinutes } from "@/lib/cabs/ui";
import { formatPaise } from "@/lib/money";
import { parseCabSearch } from "@/schemas/cabs";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cabs.landing" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Cab search: the tabbed widget, popular routes priced by the server and a
 * short trust strip. Query params (from "Modify") prefill the widget.
 */
export default async function CabsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const t = await getTranslations("cabs");
  const [catalog, settings] = await Promise.all([getCabCatalog(), getCabSettings()]);
  const now = new Date();
  const options = cabSearchOptions(catalog, settings, locale, now);
  const routes = popularRoutes(catalog, settings, locale, now);
  const freeHours = freeCancellationHours(settings.cancellation_rules);
  const initial = Object.keys(raw).length ? parseCabSearch(raw) : undefined;

  const trust = [
    { icon: BadgeCheck, key: "verified" },
    { icon: Clock, key: "onTime" },
    { icon: Headphones, key: "support" },
    { icon: IndianRupee, key: "transparent" },
  ] as const;
  const steps = [
    { icon: Search, key: "search" },
    { icon: Car, key: "choose" },
    { icon: CalendarCheck, key: "book" },
  ] as const;

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-sky to-background pb-16">
        <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:pt-12">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
              <MapPin className="size-4" aria-hidden="true" /> {t("landing.eyebrow")}
            </p>
            <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight">
              {t("landing.title")}
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">{t("landing.subtitle")}</p>
          </div>
          <CabSearchForm options={options} initial={initial} locale={locale} />
          {freeHours !== null ? (
            <p className="flex items-center gap-2 text-sm text-accent-green">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("landing.freeCancel", { hours: freeHours })}
            </p>
          ) : null}
        </div>
        <TempleSkyline className="absolute bottom-0 h-14 text-brand-navy/10 dark:text-white/5" />
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
        {routes.length ? (
          <section aria-labelledby="popular-routes" className="space-y-4">
            <h2 id="popular-routes" className="text-xl font-bold text-heading">
              {t("landing.popularTitle")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routes.map((r) => {
                const d = splitMinutes(r.durationMinutes);
                return (
                  <li key={r.slug}>
                    <Link
                      href={{ pathname: "/cabs/search", query: r.query }}
                      className="flex h-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary hover:shadow-md"
                    >
                      <span className="min-w-0 space-y-1">
                        <span className="block text-xs font-semibold text-primary">
                          {t(`landing.routeType.${r.type}`)}
                        </span>
                        <span className="block font-bold">
                          {r.from} → {r.to}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t("results.distanceTime", {
                            km: r.distanceKm,
                            hours: d.hours,
                            minutes: d.minutes,
                          })}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-right">
                        {r.fromPaise !== null ? (
                          <span>
                            <span className="block text-xs text-muted-foreground">{t("landing.from")}</span>
                            <span className="block font-extrabold">{formatPaise(r.fromPaise, locale)}</span>
                          </span>
                        ) : null}
                        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="why-us" className="space-y-4">
          <h2 id="why-us" className="text-xl font-bold text-heading">
            {t("landing.whyTitle")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {trust.map(({ icon: Icon, key }) => (
              <li key={key} className="space-y-2 rounded-2xl border bg-card p-4">
                <span className="grid size-10 place-items-center rounded-full bg-brand-navy text-white">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <p className="font-semibold text-heading">{t(`trust.${key}.title`)}</p>
                <p className="text-sm text-muted-foreground">{t(`trust.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-it-works" className="space-y-4">
          <h2 id="how-it-works" className="text-xl font-bold text-heading">
            {t("landing.howTitle")}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, key }, i) => (
              <li key={key} className="flex gap-3 rounded-2xl border bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">
                    {i + 1}. {t(`landing.steps.${key}.title`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t(`landing.steps.${key}.body`, { percent: settings.advance_percent })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
