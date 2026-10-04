import { ArrowLeft, CalendarDays, Clock, MapPin, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutForm } from "@/components/booking/checkout-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listTravellers } from "@/lib/account/travellers";
import { requireUser } from "@/lib/auth/guards";
import { prepareHotelCheckout } from "@/lib/bookings/hotel-checkout";
import { toPreview } from "@/lib/bookings/preview";
import { cancellationText } from "@/lib/hotels/policy-text";
import { pickStay, toQuery, type RawParams } from "@/lib/hotels/url";
import { pickLocalized } from "@/lib/i18n/localized";
import { createPublicClient } from "@/lib/supabase/public";
import { cn } from "@/lib/utils";
import { hotelCheckoutSchema } from "@/schemas/booking";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("title"), robots: { index: false } };
}

/** Public coupons this stay can use, suggested under the coupon box. */
async function suggestedCoupons(hotelId: string, locale: string) {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("coupons")
    .select("code, description, services, hotel_ids")
    .eq("is_public", true)
    .is("user_id", null)
    .order("code")
    .limit(10);
  return (data ?? [])
    .filter(
      (c) =>
        (c.services.length === 0 || c.services.includes("hotel")) &&
        (c.hotel_ids.length === 0 || c.hotel_ids.includes(hotelId)),
    )
    .map((c) => ({ code: c.code, description: c.description ? pickLocalized(c.description, locale) : "" }));
}

export default async function BookHotelPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const query = toQuery(await searchParams);
  const qs = new URLSearchParams(query).toString();
  const session = await requireUser(`/hotels/${slug}/book${qs ? `?${qs}` : ""}`);
  const t = await getTranslations("checkout");
  const th = await getTranslations("hotels");

  const parsed = hotelCheckoutSchema.safeParse({ ...query, hotel: slug, locale });
  const result = parsed.success ? await prepareHotelCheckout(parsed.data, session.user.id) : null;
  const back = { pathname: `/hotels/${slug}` as const, query: pickStay(query) };

  if (!result?.ok) {
    const reason = result && !result.ok ? result.error : "invalid_stay";
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{t("unavailableTitle")}</h1>
        <p className="text-muted-foreground">{t(`errors.${reason}`)}</p>
        <Button asChild>
          <Link href={back}>{t("backToHotel")}</Link>
        </Button>
      </div>
    );
  }

  const { hotel, room, plan, stay, quote } = result;
  const [coupons, travellers] = await Promise.all([
    suggestedCoupons(hotel.id, locale),
    listTravellers(session.user.id).catch(() => []),
  ]);
  const name = pickLocalized(hotel.name, locale);
  const image = hotel.images.find((i) => i.roomId === room.id) ?? hotel.images[0];
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const fmt = (d: string) => dateFormat.format(new Date(`${d}T00:00:00Z`));
  const tCancel = (key: string, values?: Record<string, string | number>) => th(`detail.${key}`, values);

  const details = (
    <div className="space-y-6">
      <section aria-labelledby="stay" className="overflow-hidden rounded-2xl border bg-card">
        <div className={cn("grid gap-4 p-4", image && "sm:grid-cols-[10rem_1fr]")}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- small summary thumbnail
            <img src={image.url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
          ) : null}
          <div className="space-y-1.5">
            <h2 id="stay" className="text-lg font-bold">
              {name}
            </h2>
            {hotel.address ? (
              <p className="flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {hotel.address}
              </p>
            ) : null}
            <p className="text-sm font-semibold">
              {pickLocalized(room.name, locale)} · {pickLocalized(plan.name, locale)}
            </p>
            <p className="text-xs text-muted-foreground">{th(`mealPlans.${plan.mealPlan}`)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm sm:grid-cols-3">
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" /> {t("checkIn")}
            </dt>
            <dd className="font-semibold">{fmt(stay.checkIn)}</dd>
            <dd className="text-xs text-muted-foreground">{t("fromTime", { time: hotel.checkInTime })}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" /> {t("checkOut")}
            </dt>
            <dd className="font-semibold">{fmt(stay.checkOut)}</dd>
            <dd className="text-xs text-muted-foreground">{t("byTime", { time: hotel.checkOutTime })}</dd>
          </div>
          <div className="col-span-2 bg-card p-3 sm:col-span-1">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" /> {t("guests")}
            </dt>
            <dd className="font-semibold">
              {th("detail.staySummary", {
                nights: quote.nights.length,
                rooms: stay.rooms,
                guests: stay.adults + stay.children,
              })}
            </dd>
          </div>
        </dl>
        {plan.inclusions.length ? (
          <ul className="space-y-1 border-t p-4 text-sm">
            {plan.inclusions.map((inc, i) => (
              <li key={i}>✓ {pickLocalized(inc, locale)}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="policy" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="policy" className="flex items-center gap-2 text-base font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> {t("policyTitle")}
        </h2>
        <p className={plan.isRefundable && plan.cancellationRules.length ? "text-accent-green" : ""}>
          {cancellationText(plan.cancellationRules, plan.isRefundable, tCancel)}
        </p>
        {plan.isRefundable && plan.cancellationRules.length ? (
          <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
            {[...plan.cancellationRules]
              .sort((a, b) => b.hours_before - a.hours_before)
              .map((r) => (
                <li key={r.hours_before}>
                  {t("policyRule", { hours: r.hours_before, percent: r.refund_percent })}
                </li>
              ))}
            <li>{t("policyAfter")}</li>
          </ul>
        ) : null}
        <p className="flex items-center gap-2">
          <Clock className="size-4 text-primary" aria-hidden="true" />
          {th("detail.checkInOut", { checkIn: hotel.checkInTime, checkOut: hotel.checkOutTime })}
        </p>
        {hotel.policies.id_proofs.length ? (
          <p>
            {th("detail.idProofs", {
              list: hotel.policies.id_proofs.map((p) => th(`idProofs.${p}`)).join(", "),
            })}
          </p>
        ) : null}
        <p>
          {hotel.policies.unmarried_couples_allowed
            ? th("detail.couplesWelcome")
            : th("detail.couplesNotAllowed")}
        </p>
        {hotel.policies.rules.length ? (
          <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
            {hotel.policies.rules.map((r, i) => (
              <li key={i}>{pickLocalized(r, locale)}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32 sm:py-8 lg:pb-8">
      <Link
        href={back}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("backToHotel")}
      </Link>
      <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{t("title")}</h1>
      <CheckoutForm
        request={{
          hotel: slug,
          plan: plan.id,
          checkin: stay.checkIn,
          checkout: stay.checkOut,
          rooms: stay.rooms,
          adults: stay.adults,
          children: stay.children,
          locale: locale === "hi" ? "hi" : "en",
        }}
        initial={toPreview(result)}
        guestCount={stay.adults + stay.children}
        defaults={{
          name: session.profile?.full_name ?? "",
          email: session.user.email ?? "",
          phone: session.profile?.phone ?? "",
        }}
        coupons={coupons}
        hotelName={name}
        savedTravellers={travellers.map((tr) => ({ id: tr.id, name: tr.fullName, phone: tr.phone }))}
      >
        {details}
      </CheckoutForm>
    </div>
  );
}
