import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  Clock,
  MapPin,
  MessageCircle,
  Moon,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RideCheckoutForm } from "@/components/rides/ride-checkout-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { cancellationItems, formatIndiaDateTime, splitMinutes, toQueryString } from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { getIcon } from "@/lib/icons";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { prepareRideCheckout } from "@/lib/rides/checkout";
import { placeName } from "@/lib/rides/page-data";
import { toRidePreview } from "@/lib/rides/preview";
import { getRideSettings } from "@/lib/rides/queries";
import { ridePlanErrorValues, rideSearchQuery } from "@/lib/rides/ui";
import { createPublicClient } from "@/lib/supabase/public";
import { parseRideSearch, rideCheckoutSchema } from "@/schemas/rides";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rides.review" });
  return { title: t("title"), robots: { index: false } };
}

/** Public coupons valid for rides, suggested under the coupon box. */
async function suggestedCoupons(locale: string) {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("coupons")
    .select("code, description, services")
    .eq("is_public", true)
    .order("code")
    .limit(10);
  return (data ?? [])
    .filter((c) => c.services.length === 0 || c.services.includes("ride"))
    .map((c) => ({ code: c.code, description: c.description ? pickLocalized(c.description, locale) : "" }));
}

/**
 * Ride review: the server prices the chosen vehicle again (never the
 * browser), then the form takes the coupon, payment choice and rider
 * details and books through `bookRide`.
 */
export default async function RideReviewPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const search = parseRideSearch(raw);
  const query = rideSearchQuery(search);
  const session = await requireUser(`/rides/review${toQueryString(query)}`);
  const t = await getTranslations("rides");

  const parsed = rideCheckoutSchema.safeParse({ ...search, locale });
  const [result, settings, business] = await Promise.all([
    parsed.success ? prepareRideCheckout(parsed.data, session.user.id) : null,
    getRideSettings(),
    getBusinessInfo(),
  ]);
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "") || null;
  const back = { pathname: "/rides" as const, query };

  if (!result?.ok) {
    const reason = result && !result.ok ? result.error : "not_found";
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <CircleAlert className="mx-auto size-10 text-accent-orange" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t(`errors.${reason}.title`)}</h1>
        <p className="text-muted-foreground">{t(`errors.${reason}.body`, ridePlanErrorValues(settings))}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={back}>{t("review.backToRides")}</Link>
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

  const { plan, type, terms } = result;
  const preview = toRidePreview(result);
  const coupons = await suggestedCoupons(locale);
  const here = t("search.myLocation");
  const fromName = placeName(plan.pickup, locale) ?? here;
  const toName = plan.drop ? (placeName(plan.drop, locale) ?? here) : null;
  const title =
    plan.mode === "hourly"
      ? t("results.hourlyTitle", { hours: plan.hours ?? 0, from: fromName })
      : `${fromName} → ${toName ?? ""}`;
  const vehicle = pickLocalized(type.name, locale);
  const Icon = getIcon(type.icon);
  const d = splitMinutes(plan.durationMinutes ?? 0);
  const money = (paise: number) => formatPaise(paise, locale);
  const pickupText = plan.isNow
    ? t("results.pickupNow", { time: formatIndiaDateTime(plan.pickupAt, locale) })
    : formatIndiaDateTime(plan.pickupAt, locale, true);

  const details = (
    <div className="space-y-6">
      <section aria-labelledby="ride-summary" className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex gap-4 p-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Icon className="size-8" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold text-primary">
              {t(`search.modes.${plan.mode}`)} · {pickLocalized(plan.zone.name, locale)}
            </p>
            <h2 id="ride-summary" className="text-lg leading-snug font-bold">
              {title}
            </h2>
            <p className="flex flex-wrap gap-x-4 text-sm">
              <span className="font-semibold">{vehicle}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {t("results.seats", { count: type.seats })}
              </span>
            </p>
            {!type.instantBook ? (
              <p className="text-xs font-medium text-accent-orange">{t("review.onRequest")}</p>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm">
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden="true" /> {t("review.pickup")}
            </dt>
            <dd className="font-semibold">{pickupText}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" /> {t("review.passengers")}
            </dt>
            <dd className="font-semibold">{plan.passengers}</dd>
          </div>
          <div className="col-span-2 bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" /> {t("review.route")}
            </dt>
            <dd className="font-semibold">{title}</dd>
            <dd className="text-xs text-muted-foreground">
              {plan.distanceKm !== null
                ? t("results.distanceTime", { km: plan.distanceKm, hours: d.hours, minutes: d.minutes })
                : t("results.hoursLine", { hours: plan.hours ?? 0 })}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="ride-terms" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="ride-terms" className="text-base font-bold">
          {t("review.termsTitle")}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
            {plan.mode === "hourly"
              ? t("terms.hours", { hours: terms.hours ?? plan.hours ?? 0, km: terms.includedKm })
              : t("terms.km", { km: terms.includedKm })}
          </li>
          {terms.extraKmPaise > 0 ? (
            <li className="flex items-start gap-2">
              <Route className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
              {t("terms.extraKm", { rate: money(terms.extraKmPaise) })}
            </li>
          ) : null}
          {terms.freeWaitingMinutes > 0 ? (
            <li className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
              {t("terms.waitingFree", { minutes: terms.freeWaitingMinutes })}
            </li>
          ) : null}
          {terms.perMinWaitingPaise > 0 ? (
            <li className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
              {t("terms.waitingCharge", { rate: money(terms.perMinWaitingPaise) })}
            </li>
          ) : null}
          {terms.night ? (
            <li className="flex items-start gap-2">
              <Moon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("terms.night")}
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="ride-policy" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="ride-policy" className="flex items-center gap-2 text-base font-bold">
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32 sm:py-8 lg:pb-8">
      <Link
        href={back}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("review.backToRides")}
      </Link>
      <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{t("review.title")}</h1>
      <RideCheckoutForm
        request={{ ...search, v: type.key, locale: locale === "hi" ? "hi" : "en" }}
        initial={preview}
        mode={plan.mode}
        defaults={{
          name: session.profile?.full_name ?? "",
          email: session.user.email ?? "",
          phone: session.profile?.phone ?? "",
          pickupAddress: plan.pickup.point ? pickLocalized(plan.pickup.point.name, locale) : "",
          dropAddress: plan.drop?.point ? pickLocalized(plan.drop.point.name, locale) : "",
        }}
        coupons={coupons}
        description={`${type.name.en} · ${title}`}
      >
        {details}
      </RideCheckoutForm>
    </div>
  );
}
