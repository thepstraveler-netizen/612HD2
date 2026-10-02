import {
  BadgeCheck,
  Bike,
  CalendarClock,
  CalendarCheck,
  KeyRound,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  Route,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RideResults, type RideCta } from "@/components/rides/ride-results";
import { RideSearchForm } from "@/components/rides/ride-search-form";
import { EmptyState } from "@/components/shared/empty-state";
import { TempleSkyline } from "@/components/shared/motifs";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { formatIndiaDateTime, splitMinutes } from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { placeName, rideResultOffers, rideSearchOptions } from "@/lib/rides/page-data";
import { getRideCatalog, getRideSettings } from "@/lib/rides/queries";
import { planRide } from "@/lib/rides/search";
import { ridePlanErrorValues, rideSearchQuery, rideSearchSubmitted } from "@/lib/rides/ui";
import { parseRideSearch } from "@/schemas/rides";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rides.landing" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Local rides: the search form and, once a search is in the URL, one priced
 * card per vehicle type (lib/rides/search). Fares can be browsed even while
 * online booking (`booking.rides`) is closed; then the cards offer WhatsApp
 * or a call instead of booking.
 */
export default async function RidesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const search = parseRideSearch(raw);
  const submitted = rideSearchSubmitted(raw);
  const t = await getTranslations("rides");
  const [catalog, settings, bookingOpen, business] = await Promise.all([
    getRideCatalog(),
    getRideSettings(),
    getFeatureFlag("booking.rides"),
    getBusinessInfo(),
  ]);
  const now = new Date();
  const options = rideSearchOptions(catalog, settings, locale, now);
  const planned = submitted ? planRide(search, catalog, settings, now) : null;
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "") || null;
  const phone = business.phone ? business.phone.replace(/[^0-9+]/g, "") : null;
  const hasInitial = Object.keys(raw).length > 0;

  let results: ReactNode = null;
  if (planned && !planned.ok) {
    results = (
      <EmptyState
        icon={MapPinned}
        title={t(`errors.${planned.error}.title`)}
        description={t(`errors.${planned.error}.body`, ridePlanErrorValues(settings))}
        action={
          planned.error === "out_of_area" || planned.error === "too_long" ? (
            <Button asChild variant="outline">
              <Link href="/cabs">{t("results.tryCabs")}</Link>
            </Button>
          ) : null
        }
      />
    );
  } else if (planned?.ok) {
    const { plan } = planned;
    const here = t("search.myLocation");
    const fromName = placeName(plan.pickup, locale) ?? here;
    const toName = plan.drop ? (placeName(plan.drop, locale) ?? here) : null;
    const title =
      plan.mode === "hourly"
        ? t("results.hourlyTitle", { hours: plan.hours ?? 0, from: fromName })
        : `${fromName} → ${toName ?? ""}`;
    const offers = rideResultOffers(plan, catalog, settings, locale, search.v);
    const pickup = plan.isNow
      ? t("results.pickupNow", { time: formatIndiaDateTime(plan.pickupAt, locale) })
      : formatIndiaDateTime(plan.pickupAt, locale);
    const d = splitMinutes(plan.durationMinutes ?? 0);
    const query = rideSearchQuery(search);
    const cta: RideCta = bookingOpen
      ? { kind: "book", query }
      : {
          kind: "enquire",
          whatsapp,
          phone,
          rideText: `${title} · ${pickup} · ${t("results.paxCount", { count: plan.passengers })}`,
        };
    results = (
      <div className="space-y-4">
        <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-primary">
            {t(`search.modes.${plan.mode}`)} · {pickLocalized(plan.zone.name, locale)}
          </p>
          <h2 className="text-xl leading-tight font-bold">{title}</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden="true" /> {pickup}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Route className="size-4" aria-hidden="true" />
              {plan.distanceKm !== null
                ? t("results.distanceTime", { km: plan.distanceKm, hours: d.hours, minutes: d.minutes })
                : t("results.hoursLine", { hours: plan.hours ?? 0 })}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />{" "}
              {t("results.paxCount", { count: plan.passengers })}
            </li>
          </ul>
          {plan.distanceKm !== null ? (
            <p className="text-xs text-muted-foreground">{t("results.estimateNote")}</p>
          ) : null}
        </div>
        {offers.length ? (
          <RideResults
            offers={offers}
            cta={cta}
            passengers={plan.passengers}
            chosen={search.v}
            locale={locale}
          />
        ) : (
          <EmptyState icon={Bike} title={t("results.noneTitle")} description={t("results.noneBody")} />
        )}
      </div>
    );
  }

  const steps = [
    { icon: Search, key: "search" },
    { icon: CalendarCheck, key: "book" },
    { icon: KeyRound, key: "otp" },
    { icon: Wallet, key: "pay" },
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
          {!bookingOpen ? (
            <div
              role="note"
              className="space-y-3 rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4 text-sm"
            >
              <p className="font-semibold">{t("closed.title")}</p>
              <p>{t("closed.body")}</p>
              {whatsapp || phone ? (
                <div className="flex flex-wrap gap-2">
                  {whatsapp ? (
                    <Button asChild variant="outline">
                      <a
                        href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t("closed.whatsappText"))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle /> {t("closed.whatsapp")}
                      </a>
                    </Button>
                  ) : null}
                  {phone ? (
                    <Button asChild variant="outline">
                      <a href={`tel:${phone}`}>
                        <Phone /> {t("closed.call")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <RideSearchForm options={options} initial={hasInitial ? search : undefined} />
        </div>
        <TempleSkyline className="absolute bottom-0 h-14 text-brand-navy/10 dark:text-white/5" />
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
        {results ? (
          <section id="results" aria-labelledby="ride-results" className="scroll-mt-20 space-y-4">
            <h2 id="ride-results" className="text-xl font-bold text-heading">
              {t("results.heading")}
            </h2>
            <div aria-live="polite">{results}</div>
          </section>
        ) : null}

        <section aria-labelledby="ride-how" className="space-y-4">
          <h2 id="ride-how" className="text-xl font-bold text-heading">
            {t("landing.howTitle")}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    {t(`landing.steps.${key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BadgeCheck className="size-4 text-accent-green" aria-hidden="true" /> {t("landing.areas")}
          </p>
        </section>
      </div>
    </>
  );
}
