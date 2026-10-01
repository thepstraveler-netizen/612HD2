import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Clock,
  Headphones,
  IndianRupee,
  MapPinned,
  Pencil,
  Route,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CabResults, type ResultCta, type ResultOffer } from "@/components/cabs/cab-results";
import { CabSearchForm } from "@/components/cabs/cab-search-form";
import { EmptyState } from "@/components/shared/empty-state";
import { Link } from "@/i18n/navigation";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { cabSearchOptions, planErrorValues, planTitle } from "@/lib/cabs/page-data";
import { getCabCatalog, getCabSettings } from "@/lib/cabs/queries";
import { addonsFor, cabOffers, planTrip } from "@/lib/cabs/search";
import {
  cabSearchQuery,
  featuredModel,
  formatIndiaDateTime,
  freeCancellationHours,
  splitMinutes,
} from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { parseCabSearch } from "@/schemas/cabs";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cabs.results" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Cab results. The search lives in the URL; the server plans the trip and
 * prices every category (lib/cabs/search), the client only filters.
 */
export default async function CabResultsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = parseCabSearch(await searchParams);
  const t = await getTranslations("cabs");
  const [catalog, settings, bookingOpen, business] = await Promise.all([
    getCabCatalog(),
    getCabSettings(),
    getFeatureFlag("booking.cabs"),
    getBusinessInfo(),
  ]);
  const now = new Date();
  const options = cabSearchOptions(catalog, settings, locale, now);
  const planned = planTrip(search, catalog, settings, now);
  const query = cabSearchQuery(search);

  const modify = (open: boolean) => (
    <details open={open} className="group rounded-2xl">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold text-primary hover:bg-accent [&::-webkit-details-marker]:hidden">
        <Pencil className="size-4" aria-hidden="true" /> {t("results.modify")}
      </summary>
      <CabSearchForm options={options} initial={search} locale={locale} className="mt-3 shadow-sm" />
    </details>
  );

  if (!planned.ok) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <Link
          href="/cabs"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("results.back")}
        </Link>
        <h1 className="text-[length:var(--text-title)] font-bold">{t("results.heading")}</h1>
        <EmptyState
          icon={MapPinned}
          title={t(`errors.${planned.error}.title`)}
          description={t(`errors.${planned.error}.body`, planErrorValues(settings))}
        />
        <CabSearchForm options={options} initial={search} locale={locale} />
      </div>
    );
  }

  const { plan } = planned;
  const title = planTitle(plan, locale);
  const offers: ResultOffer[] = cabOffers(plan, catalog, settings).map((o) => {
    const featured = featuredModel(o.category.models);
    return {
      key: o.category.key,
      name: pickLocalized(o.category.name, locale),
      description: o.category.description ? pickLocalized(o.category.description, locale) : null,
      image: o.category.image,
      seats: o.category.seats,
      luggage: o.category.luggage,
      isAc: o.category.isAc,
      models: o.category.models,
      featured: featured?.name ?? null,
      totalPaise: o.totalPaise,
      includedKm: o.quote.inclusions.includedKm,
      extraKmPaise: o.quote.inclusions.extraKmPaise,
      hours: o.quote.inclusions.hours,
      extraHourPaise: o.quote.inclusions.extraHourPaise,
      fits: o.fits,
      addons: addonsFor(catalog, plan.tripType, o.category.id).map((a) => pickLocalized(a.name, locale)),
    };
  });
  const pickup = formatIndiaDateTime(plan.pickupAt, locale);
  const cta: ResultCta = bookingOpen
    ? { kind: "book", query }
    : {
        kind: "enquire",
        whatsapp: business.whatsapp.replace(/[^0-9]/g, "") || null,
        phone: business.phone ? business.phone.replace(/[^0-9+]/g, "") : null,
        tripText: `${title} · ${pickup} · ${t("results.paxCount", { count: plan.passengers })}`,
      };
  const d = splitMinutes(plan.durationMinutes);
  const trust = [
    { icon: BadgeCheck, key: "verified" },
    { icon: Clock, key: "onTime" },
    { icon: Headphones, key: "support" },
    { icon: IndianRupee, key: "transparent" },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <section aria-labelledby="trip-summary" className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold text-primary">{t(`tripTypes.${plan.tripType}`)}</p>
            <h1 id="trip-summary" className="text-xl leading-tight font-bold sm:text-2xl">
              {title}
            </h1>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" aria-hidden="true" /> {pickup}
            {plan.returnAt ? ` → ${formatIndiaDateTime(plan.returnAt, locale)}` : null}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Route className="size-4" aria-hidden="true" />
            {plan.distanceSource === "package"
              ? t("results.packageLine", { hours: plan.pkg?.hours ?? 0, km: plan.distanceKm })
              : t("results.distanceTime", { km: plan.distanceKm, hours: d.hours, minutes: d.minutes })}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />{" "}
            {t("results.paxCount", { count: plan.passengers })}
          </li>
        </ul>
        {plan.route?.stops.length ? (
          <p className="text-sm">{t("results.stops", { list: plan.route.stops.join(" · ") })}</p>
        ) : null}
        {plan.distanceSource === "estimate" ? (
          <p className="text-xs text-muted-foreground">{t("results.estimateNote")}</p>
        ) : null}
        {modify(false)}
      </section>

      <ul
        aria-label={t("landing.whyTitle")}
        className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/60 p-3 text-sm sm:grid-cols-4"
      >
        {trust.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-center gap-2 font-medium text-secondary-foreground">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /> {t(`trust.${key}.title`)}
          </li>
        ))}
      </ul>

      {!bookingOpen ? (
        <p role="note" className="rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4 text-sm">
          {t("results.bookingSoon")}
        </p>
      ) : null}

      <CabResults
        offers={offers}
        cta={cta}
        passengers={plan.passengers}
        freeCancelHours={freeCancellationHours(settings.cancellation_rules)}
        locale={locale}
      />
    </div>
  );
}
