import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Map as MapIcon,
  MapPin,
  Plane,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { TripActions } from "@/components/booking/trip-actions";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { getMyTrip } from "@/lib/bookings/trips";
import type { BookingStatus } from "@/lib/bookings/state";
import { formatIndiaDateTime } from "@/lib/cabs/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { formatTourDate, packageLineLabel, packageSnapshot, quoteSnapshot } from "@/lib/packages/ui";
import type { Tables } from "@/types/database";

type TripData = NonNullable<Awaited<ReturnType<typeof getMyTrip>>>;
export type CustomerPackageRow = Pick<Tables<"package_bookings">, "travellers" | "pickup_point">;

function travellerNames(row: CustomerPackageRow | null, fallback: { full_name: string }[]): string[] {
  const list = Array.isArray(row?.travellers) ? row.travellers : [];
  const names = list
    .map((t) => (t && typeof t === "object" && !Array.isArray(t) && typeof t.name === "string" ? t.name : ""))
    .filter(Boolean);
  return names.length ? names : fallback.map((g) => g.full_name).filter(Boolean);
}

/** Status banner shared by package and quote bookings. */
async function Banner({ data, locale }: { data: TripData; locale: string }) {
  const t = await getTranslations("trips");
  const tp = await getTranslations("packages.trip");
  const { booking } = data;
  const status = booking.status as BookingStatus;
  const balance = Math.max(0, booking.total_paise - booking.paid_paise);
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > Date.now();
  if (status === "confirmed" || status === "completed") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
        <div>
          <p className="font-bold">{tp(status === "completed" ? "bannerCompleted" : "bannerConfirmed")}</p>
          <p className="text-sm text-muted-foreground">
            {balance > 0 && status === "confirmed"
              ? tp("balanceDue", { amount: formatPaise(balance, locale) })
              : t("paidInFull")}
          </p>
        </div>
      </div>
    );
  }
  if (status === "pending_payment") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4">
        <Clock className="size-6 shrink-0 text-accent-orange" aria-hidden="true" />
        <div>
          <p className="font-bold">{t("bannerPending")}</p>
          <p className="text-sm text-muted-foreground">
            {holding && booking.expires_at
              ? tp("pendingHint", { time: formatIndiaDateTime(booking.expires_at, locale) })
              : t("pendingProcessing")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-secondary p-4">
      <XCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-bold">{t(`banner.${status}`)}</p>
        {booking.refunded_paise > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("refundedAmount", { amount: formatPaise(booking.refunded_paise, locale) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Price lines, totals, payments and the invoice (shared by package and quote bookings). */
async function PaymentSummary({ data, locale }: { data: TripData; locale: string }) {
  const t = await getTranslations("trips");
  const tp = await getTranslations("packages");
  const { booking, items, payments, refunds, invoice } = data;
  const status = booking.status as BookingStatus;
  const money = (paise: number) => formatPaise(paise, locale);
  const balance = Math.max(0, booking.total_paise - booking.paid_paise);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
      <h2 className="text-base font-bold">{t("paymentTitle")}</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
        {items.map((item) => {
          const label = packageLineLabel(item.line_key);
          return (
            <div key={item.id} className="contents">
              <dt>{label ? tp(`lines.${label}`, { count: item.quantity }) : item.description}</dt>
              <dd className="text-right">{money(item.amount_paise)}</dd>
            </div>
          );
        })}
        {booking.discount_paise ? (
          <>
            <dt className="text-accent-green">{t("discount", { code: booking.coupon_code ?? "" })}</dt>
            <dd className="text-right text-accent-green">− {money(booking.discount_paise)}</dd>
          </>
        ) : null}
        <dt>{t("taxes")}</dt>
        <dd className="text-right">{money(booking.tax_paise)}</dd>
        <dt className="border-t pt-2 font-bold">{t("total")}</dt>
        <dd className="border-t pt-2 text-right font-extrabold">{money(booking.total_paise)}</dd>
        <dt>{t("paid")}</dt>
        <dd className="text-right">{money(booking.paid_paise)}</dd>
        {status === "confirmed" && balance > 0 ? (
          <>
            <dt className="font-semibold text-primary">{tp("trip.balanceLabel")}</dt>
            <dd className="text-right font-semibold text-primary">{money(balance)}</dd>
          </>
        ) : null}
        {booking.refunded_paise ? (
          <>
            <dt>{t("refunded")}</dt>
            <dd className="text-right">{money(booking.refunded_paise)}</dd>
          </>
        ) : null}
      </dl>
      {payments.some((p) => p.captured_at) || refunds.length ? (
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {payments
            .filter((p) => p.captured_at)
            .map((p) => (
              <li key={p.id}>
                {t("paymentLine", {
                  amount: money(p.amount_paise),
                  method: p.method ?? p.provider,
                  date: formatIndiaDateTime(p.captured_at as string, locale, true),
                })}
              </li>
            ))}
          {refunds.map((r, i) => (
            <li key={i}>
              {t("refundLine", { amount: money(r.amount_paise), status: t(`refundStatus.${r.status}`) })}
            </li>
          ))}
        </ul>
      ) : null}
      {invoice ? (
        <Button asChild variant="outline" className="w-full">
          <a href={`/api/invoices/${booking.code}`} target="_blank" rel="noreferrer">
            <Download /> {t("downloadInvoice", { number: invoice.number })}
          </a>
        </Button>
      ) : null}
    </section>
  );
}

/** A tour package booked online, on My Trips: dates, travellers, pickup, inclusions and balance due. */
export async function PackageTripDetail({
  data,
  row,
  locale,
}: {
  data: TripData;
  row: CustomerPackageRow | null;
  locale: string;
}) {
  const t = await getTranslations("trips");
  const tp = await getTranslations("packages");
  const { booking, guests } = data;
  const status = booking.status as BookingStatus;
  const snap = packageSnapshot(booking.snapshot);
  const pkg = snap?.package;
  const title = pkg ? pickLocalized(pkg.title, locale) : t("bookingId", { code: booking.code });
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > Date.now();
  const names = travellerNames(row, guests);
  const pickup = row?.pickup_point || pkg?.pickupPoint || "";

  return (
    <div className="space-y-6">
      <Link
        href="/account/trips"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("allTrips")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("bookingId", { code: booking.code })}</p>
          <h1 className="flex items-center gap-2 text-[length:var(--text-title)] leading-tight font-bold">
            <MapIcon className="size-6 shrink-0 text-primary" aria-hidden="true" /> {title}
          </h1>
        </div>
        <BookingStatusBadge status={status} className="text-sm" />
      </div>
      <Banner data={data} locale={locale} />

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" /> {tp("trip.dates")}
              </dt>
              <dd className="font-semibold">
                {formatTourDate(pkg?.startDate ?? booking.check_in, locale)} –{" "}
                {formatTourDate(pkg?.endDate ?? booking.check_out, locale)}
              </dd>
              {pkg ? (
                <dd className="text-xs text-muted-foreground">
                  {tp("duration", { days: pkg.days, nights: pkg.nights })}
                </dd>
              ) : null}
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {tp("checkout.travellers")}
              </dt>
              <dd className="font-semibold">
                {tp("checkout.travellersValue", {
                  adults: booking.adults ?? 1,
                  children: booking.children ?? 0,
                })}
              </dd>
              {names.length ? <dd className="text-muted-foreground">{names.join(", ")}</dd> : null}
            </div>
            {pickup ? (
              <div className="col-span-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" /> {tp("trip.pickup")}
                </dt>
                <dd>{pickup}</dd>
              </div>
            ) : null}
            {pkg?.destinations.length ? (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">{tp("trip.destinations")}</dt>
                <dd>{pkg.destinations.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>

          {pkg?.inclusions.length ? (
            <div className="space-y-1.5 border-t pt-3">
              <p className="font-semibold">{tp("detail.inclusions")}</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {pkg.inclusions.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
                    {pickLocalized(item, locale)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {snap?.cancellationPolicy ? (
            <div className="space-y-1 border-t pt-3">
              <p className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> {tp("detail.policy")}
              </p>
              <p className="whitespace-pre-line text-muted-foreground">
                {pickLocalized(snap.cancellationPolicy, locale)}
              </p>
              <p className="text-xs text-muted-foreground">{tp("trip.cancelHint")}</p>
            </div>
          ) : null}

          <TripActions
            code={booking.code}
            locale={locale}
            canPay={holding}
            cancel={null}
            description={`${pkg?.title.en ?? title} · ${booking.code}`}
          />
          {pkg?.slug ? (
            <Link
              href={`/packages/${pkg.slug}`}
              className="inline-flex min-h-11 items-center font-medium text-primary"
            >
              {tp("trip.viewPackage")}
            </Link>
          ) : null}
        </section>

        <PaymentSummary data={data} locale={locale} />
      </div>
    </div>
  );
}

/** A booking created from an agent's quote (flights, trains, buses or a custom tour). */
export async function QuoteTripDetail({ data, locale }: { data: TripData; locale: string }) {
  const t = await getTranslations("trips");
  const tq = await getTranslations("travel.trip");
  const { booking, payments } = data;
  const status = booking.status as BookingStatus;
  const snap = quoteSnapshot(booking.snapshot);
  const title = snap?.quote.title || snap?.trip?.label || t("bookingId", { code: booking.code });
  const payLink =
    status === "pending_payment"
      ? ([...payments].reverse().find((p) => p.payment_link_url && !p.captured_at)?.payment_link_url ?? null)
      : null;
  const Icon = booking.service === "package" ? MapIcon : Plane;

  return (
    <div className="space-y-6">
      <Link
        href="/account/trips"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("allTrips")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("bookingId", { code: booking.code })}</p>
          <h1 className="flex items-center gap-2 text-[length:var(--text-title)] leading-tight font-bold">
            <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" /> {title}
          </h1>
          {snap?.lead?.reference ? (
            <p className="text-sm text-muted-foreground">
              {tq("reference", { reference: snap.lead.reference, number: snap.quote.number })}
            </p>
          ) : null}
        </div>
        <BookingStatusBadge status={status} className="text-sm" />
      </div>
      <Banner data={data} locale={locale} />

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            {snap?.trip?.route ? (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">{tq("route")}</dt>
                <dd className="font-semibold">{snap.trip.route}</dd>
              </div>
            ) : null}
            {booking.check_in ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden="true" /> {tq("date")}
                </dt>
                <dd className="font-semibold">{formatTourDate(booking.check_in, locale)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {tq("travellers")}
              </dt>
              <dd className="font-semibold">
                {tq("travellersValue", { adults: booking.adults ?? 1, children: booking.children ?? 0 })}
              </dd>
            </div>
          </dl>
          {snap?.quote.notes ? (
            <div className="space-y-1 border-t pt-3">
              <p className="font-semibold">{tq("notes")}</p>
              <p className="whitespace-pre-line text-muted-foreground">{snap.quote.notes}</p>
            </div>
          ) : null}
          {snap?.quote.terms ? (
            <div className="space-y-1 border-t pt-3">
              <p className="font-semibold">{tq("terms")}</p>
              <p className="whitespace-pre-line text-muted-foreground">{snap.quote.terms}</p>
            </div>
          ) : null}
          {payLink ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={payLink} rel="noreferrer">
                <CreditCard /> {tq("pay")}
              </a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">{tq("help")}</p>
        </section>

        <PaymentSummary data={data} locale={locale} />
      </div>
    </div>
  );
}
