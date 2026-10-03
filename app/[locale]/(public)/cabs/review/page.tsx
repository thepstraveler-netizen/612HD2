import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Car,
  Check,
  CircleAlert,
  MessageCircle,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CabCheckoutForm } from "@/components/cabs/cab-checkout-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { prepareCabCheckout } from "@/lib/cabs/checkout";
import { planErrorValues, planTitle } from "@/lib/cabs/page-data";
import { toCabPreview } from "@/lib/cabs/preview";
import { getCabSettings } from "@/lib/cabs/queries";
import {
  cabSearchQuery,
  cancellationItems,
  featuredModel,
  formatIndiaDateTime,
  inclusionItems,
  splitMinutes,
  toQueryString,
} from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { createPublicClient } from "@/lib/supabase/public";
import { cabCheckoutSchema, parseCabSearch } from "@/schemas/cabs";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cabs.review" });
  return { title: t("title"), robots: { index: false } };
}

/** Public coupons valid for cabs, suggested under the coupon box. */
async function suggestedCoupons(locale: string) {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("coupons")
    .select("code, description, services")
    .eq("is_public", true)
    .is("user_id", null)
    .order("code")
    .limit(10);
  return (data ?? [])
    .filter((c) => c.services.length === 0 || c.services.includes("cab"))
    .map((c) => ({ code: c.code, description: c.description ? pickLocalized(c.description, locale) : "" }));
}

export default async function CabReviewPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const search = parseCabSearch(raw);
  const category = typeof raw.category === "string" ? raw.category : "";
  const query = cabSearchQuery(search);
  const session = await requireUser(`/cabs/review${toQueryString({ ...query, category })}`);
  const t = await getTranslations("cabs");

  const parsed = cabCheckoutSchema.safeParse({ ...search, category, locale });
  const [result, settings, business] = await Promise.all([
    parsed.success ? prepareCabCheckout(parsed.data, session.user.id) : null,
    getCabSettings(),
    getBusinessInfo(),
  ]);
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "") || null;
  const back = { pathname: "/cabs/search" as const, query };

  if (!result?.ok) {
    const reason = result && !result.ok ? result.error : "not_found";
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <CircleAlert className="mx-auto size-10 text-accent-orange" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t(`errors.${reason}.title`)}</h1>
        <p className="text-muted-foreground">{t(`errors.${reason}.body`, planErrorValues(settings))}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={back}>{t("review.backToResults")}</Link>
          </Button>
          {reason === "booking_closed" && whatsapp ? (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                <MessageCircle /> {t("review.whatsapp")}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { plan, category: cat, inclusions } = result;
  const preview = toCabPreview(result);
  const coupons = await suggestedCoupons(locale);
  const title = planTitle(plan, locale);
  const model = featuredModel(cat.models);
  const carName = pickLocalized(cat.name, locale);
  const d = splitMinutes(plan.durationMinutes);
  const money = (paise: number) => formatPaise(paise, locale);

  const details = (
    <div className="space-y-6">
      <section aria-labelledby="cab-trip" className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-4 p-4 sm:grid-cols-[8rem_1fr]">
          {cat.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- small summary thumbnail
            <img
              src={cat.image}
              alt=""
              className="aspect-[4/3] w-28 rounded-xl bg-secondary object-contain sm:w-full"
            />
          ) : (
            <span className="grid aspect-[4/3] w-28 place-items-center rounded-xl bg-secondary text-secondary-foreground sm:w-full">
              <Car className="size-10" aria-hidden="true" />
            </span>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-primary">{t(`tripTypes.${plan.tripType}`)}</p>
            <h2 id="cab-trip" className="text-lg leading-snug font-bold">
              {title}
            </h2>
            <p className="text-sm font-semibold">
              {model ? t("results.orSimilar", { model: model.name }) : carName} · {carName}
            </p>
            <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden="true" /> {t("results.seats", { count: cat.seats })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="size-3.5" aria-hidden="true" />{" "}
                {t("results.bags", { count: cat.luggage })}
              </span>
              {cat.isAc ? <span>{t("results.ac")}</span> : null}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm">
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden="true" /> {t("review.pickup")}
            </dt>
            <dd className="font-semibold">{formatIndiaDateTime(plan.pickupAt, locale, true)}</dd>
          </div>
          {plan.returnAt ? (
            <div className="bg-card p-3">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden="true" /> {t("review.return")}
              </dt>
              <dd className="font-semibold">{formatIndiaDateTime(plan.returnAt, locale, true)}</dd>
            </div>
          ) : (
            <div className="bg-card p-3">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {t("review.passengers")}
              </dt>
              <dd className="font-semibold">{plan.passengers}</dd>
            </div>
          )}
          <div className="col-span-2 bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Route className="size-3.5" aria-hidden="true" /> {t("review.distance")}
            </dt>
            <dd className="font-semibold">
              {plan.distanceSource === "package"
                ? t("results.packageLine", { hours: plan.pkg?.hours ?? 0, km: plan.distanceKm })
                : t("results.distanceTime", { km: plan.distanceKm, hours: d.hours, minutes: d.minutes })}
            </dd>
            {plan.route?.stops.length ? (
              <dd className="text-xs text-muted-foreground">
                {t("results.stops", { list: plan.route.stops.join(" · ") })}
              </dd>
            ) : null}
          </div>
        </dl>
      </section>

      <section aria-labelledby="cab-inclusions" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="cab-inclusions" className="text-base font-bold">
          {t("review.inclusionsTitle")}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {inclusionItems(inclusions, plan.tripType).map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              {item.included ? (
                <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
              )}
              <span>
                {t(`inclusions.${item.key}`, {
                  ...item.values,
                  ...Object.fromEntries(Object.entries(item.money ?? {}).map(([k, v]) => [k, money(v)])),
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cab-policy" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="cab-policy" className="flex items-center gap-2 text-base font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> {t("review.policyTitle")}
        </h2>
        <ul className="list-disc space-y-1 ps-5">
          {cancellationItems(preview.cancellationRules).map((c) => (
            <li key={`${c.hours}-${c.percent}`}>
              {t(`cancellation.${c.key}`, { hours: c.hours, percent: c.percent })}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">{t("review.policyNote")}</p>
      </section>
    </div>
  );

  const addonInfo = Object.fromEntries(
    result.addons.map((a) => [
      a.key,
      {
        name: pickLocalized(a.name, locale),
        description: a.description ? pickLocalized(a.description, locale) : "",
      },
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32 sm:py-8 lg:pb-8">
      <Link
        href={back}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("review.backToResults")}
      </Link>
      <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{t("review.title")}</h1>
      <CabCheckoutForm
        request={{ ...search, category: cat.key, locale: locale === "hi" ? "hi" : "en" }}
        initial={preview}
        addonInfo={addonInfo}
        defaults={{
          name: session.profile?.full_name ?? "",
          email: session.user.email ?? "",
          phone: session.profile?.phone ?? "",
        }}
        coupons={coupons}
        description={`${cat.name.en} · ${title}`}
        contact={{ whatsapp }}
      >
        {details}
      </CabCheckoutForm>
    </div>
  );
}
