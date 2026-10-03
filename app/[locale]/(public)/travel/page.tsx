import { Info, Map as MapIcon, Plane } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TempleSkyline } from "@/components/shared/motifs";
import { Button } from "@/components/ui/button";
import { TravelEnquiry } from "@/components/travel/travel-enquiry";
import { Link } from "@/i18n/navigation";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { getTravelSettings } from "@/lib/packages/queries";
import { parseTravelMode, travelPrefill } from "@/lib/packages/ui";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "travel" });
  return pageMetadata({ locale, path: "/travel", title: t("metaTitle"), description: t("metaDescription") });
}

/**
 * Flights, trains and buses. With the "manual" provider (the only one
 * today, see lib/travel/provider.ts) this is an enquiry form: the travel desk replies with a quote and
 * a payment link. The home search card's `mode`, `from`, `to` and `date`
 * prefill it.
 */
export default async function TravelPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const t = await getTranslations("travel");
  const settings = await getTravelSettings();
  const mode = parseTravelMode(raw.mode);
  const prefill = travelPrefill(raw);
  const notice = pickLocalized(settings.notice, locale);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-sky to-background pb-14">
        <div className="mx-auto max-w-4xl space-y-4 px-4 pt-8 sm:pt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
            <Plane className="size-4" aria-hidden="true" /> {t("eyebrow")}
          </p>
          <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
        <TempleSkyline className="absolute bottom-0 h-12 text-brand-navy/10 dark:text-white/5" />
      </section>

      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {notice ? (
          <p
            className="flex items-start gap-2 rounded-2xl border bg-card p-4 text-sm"
            data-testid="travel-notice"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {notice}
          </p>
        ) : null}

        <TravelEnquiry
          initialMode={mode}
          classes={settings.classes}
          maxTravellers={settings.max_travellers}
          minDate={todayInIndia()}
          locale={locale === "hi" ? "hi" : "en"}
          prefill={prefill}
        />

        <section aria-labelledby="how-it-works" className="space-y-3">
          <h2 id="how-it-works" className="text-xl font-bold">
            {t("howTitle")}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {(["one", "two", "three"] as const).map((step, i) => (
              <li key={step} className="space-y-1 rounded-2xl border bg-card p-4 text-sm">
                <span
                  className="grid size-8 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="font-semibold">{t(`how.${step}.title`)}</p>
                <p className="text-muted-foreground">{t(`how.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-bold">{t("packagesCta.title")}</p>
            <p className="text-sm text-muted-foreground">{t("packagesCta.body")}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/packages">
              <MapIcon /> {t("packagesCta.button")}
            </Link>
          </Button>
        </section>
      </div>
    </>
  );
}
