import {
  ArrowLeft,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  Download,
  KeyRound,
  MapPin,
  Phone,
  Route,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { TripActions } from "@/components/booking/trip-actions";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { getMyTrip } from "@/lib/bookings/trips";
import { customerCanCancel, type BookingStatus } from "@/lib/bookings/state";
import {
  cabSnapshot,
  cancellationItems,
  fareLineKey,
  formatIndiaDateTime,
  inclusionItems,
  showPickupOtp,
  tripAllowsCancel,
} from "@/lib/cabs/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { quoteRefund } from "@/lib/refunds/policy";
import type { Tables } from "@/types/database";
import { TripStatusBadge } from "./trip-status-badge";

export type CustomerTripRow = Pick<
  Tables<"trips">,
  | "status"
  | "pickup_address"
  | "drop_address"
  | "passengers"
  | "driver_name"
  | "driver_phone"
  | "vehicle_label"
  | "vehicle_registration"
  | "pickup_otp"
>;

/** A cab booking on My Trips: trip status, driver, pickup OTP, fare and cancellation. */
export async function CabTripDetail({
  data,
  trip,
  locale,
  cancellationEnabled,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getMyTrip>>>;
  trip: CustomerTripRow | null;
  locale: string;
  cancellationEnabled: boolean;
}) {
  const t = await getTranslations("trips");
  const tc = await getTranslations("cabs");
  const { booking, items, payments, refunds, invoice } = data;
  const status = booking.status as BookingStatus;
  const snap = cabSnapshot(booking.snapshot);
  const now = new Date();
  const pickupAt = snap ? new Date(snap.trip.pickupAt) : null;
  const money = (paise: number) => formatPaise(paise, locale);
  const refund = quoteRefund({
    rules: snap?.cancellationRules ?? [],
    isRefundable: true,
    checkInAt: pickupAt ?? now,
    now,
    totalPaise: booking.total_paise,
    paidPaise: booking.paid_paise,
    refundedPaise: booking.refunded_paise,
  });
  const canCancel =
    cancellationEnabled &&
    pickupAt !== null &&
    customerCanCancel(status, pickupAt, now) &&
    tripAllowsCancel(trip?.status ?? null);
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > now.getTime();
  const balance = Math.max(0, booking.total_paise - booking.paid_paise);
  const title = snap?.trip.route || snap?.trip.label || t("bookingId", { code: booking.code });
  const car = snap?.category?.name ? pickLocalized(snap.category.name, locale) : "";
  const live = status === "confirmed" && trip !== null;

  const banner =
    status === "confirmed" || status === "completed" ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
        <div>
          <p className="font-bold">
            {status === "completed"
              ? tc("trip.bannerCompleted")
              : tc(`trip.banner.${trip?.status ?? "unassigned"}`)}
          </p>
          <p className="text-sm text-muted-foreground">
            {balance > 0 && status === "confirmed"
              ? tc("trip.balanceToDriver", { amount: money(balance) })
              : t("paidInFull")}
          </p>
        </div>
      </div>
    ) : status === "pending_payment" ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4">
        <Clock className="size-6 shrink-0 text-accent-orange" aria-hidden="true" />
        <div>
          <p className="font-bold">{t("bannerPending")}</p>
          <p className="text-sm text-muted-foreground">
            {holding && booking.expires_at
              ? tc("trip.pendingHint", { time: formatIndiaDateTime(booking.expires_at, locale) })
              : t("pendingProcessing")}
          </p>
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3 rounded-2xl border bg-secondary p-4">
        <XCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-bold">{t(`banner.${status}`)}</p>
          {booking.refunded_paise > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("refundedAmount", { amount: money(booking.refunded_paise) })}
            </p>
          ) : null}
        </div>
      </div>
    );

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
            <Car className="size-6 shrink-0 text-primary" aria-hidden="true" /> {title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <BookingStatusBadge status={status} className="text-sm" />
          {live && trip ? <TripStatusBadge status={trip.status} className="text-sm" /> : null}
        </div>
      </div>
      {banner}

      {trip && showPickupOtp(status, trip.status, trip.pickup_otp) ? (
        <section
          aria-labelledby="pickup-otp"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4"
        >
          <div className="space-y-1">
            <h2 id="pickup-otp" className="flex items-center gap-2 font-bold">
              <KeyRound className="size-5 text-primary" aria-hidden="true" /> {tc("trip.otpTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">{tc("trip.otpHint")}</p>
          </div>
          <p
            className="font-mono text-4xl font-extrabold tracking-[0.35em] text-heading"
            aria-label={tc("trip.otpAria", { otp: (trip.pickup_otp ?? "").split("").join(" ") })}
          >
            {trip.pickup_otp}
          </p>
        </section>
      ) : null}

      {live && trip?.driver_name ? (
        <section aria-labelledby="driver" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 id="driver" className="text-base font-bold">
            {tc("trip.driverTitle")}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{trip.driver_name}</p>
                <p className="text-muted-foreground">
                  {[trip.vehicle_label, trip.vehicle_registration].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {trip.driver_phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${trip.driver_phone.replace(/[^0-9+]/g, "")}`}>
                  <Phone /> {tc("trip.callDriver")}
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            {pickupAt ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden="true" /> {tc("review.pickup")}
                </dt>
                <dd className="font-semibold">{formatIndiaDateTime(pickupAt, locale, true)}</dd>
              </div>
            ) : null}
            {snap?.trip.returnAt ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden="true" /> {tc("review.return")}
                </dt>
                <dd className="font-semibold">{formatIndiaDateTime(snap.trip.returnAt, locale, true)}</dd>
              </div>
            ) : null}
            {trip?.pickup_address ? (
              <div className="col-span-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" /> {tc("trip.pickupAddress")}
                </dt>
                <dd>{trip.pickup_address}</dd>
              </div>
            ) : null}
            {trip?.drop_address ? (
              <div className="col-span-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" /> {tc("trip.dropAddress")}
                </dt>
                <dd>{trip.drop_address}</dd>
              </div>
            ) : null}
            {snap?.trip.stops.length ? (
              <div className="col-span-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Route className="size-3.5" aria-hidden="true" /> {tc("trip.stops")}
                </dt>
                <dd>{snap.trip.stops.join(" · ")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Car className="size-3.5" aria-hidden="true" /> {tc("trip.vehicle")}
              </dt>
              <dd className="font-semibold">{car || snap?.trip.vehicle}</dd>
              {car && snap?.trip.vehicle ? (
                <dd className="text-xs text-muted-foreground">{snap.trip.vehicle}</dd>
              ) : null}
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {tc("review.passengers")}
              </dt>
              <dd className="font-semibold">{trip?.passengers ?? booking.adults}</dd>
            </div>
          </dl>

          {snap?.inclusions ? (
            <ul className="grid gap-1.5 border-t pt-3">
              {inclusionItems(snap.inclusions, snap.trip.type).map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  {item.included ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
                  )}
                  <span>
                    {tc(`inclusions.${item.key}`, {
                      ...item.values,
                      ...Object.fromEntries(Object.entries(item.money ?? {}).map(([k, v]) => [k, money(v)])),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {snap?.cancellationRules.length ? (
            <div className="space-y-1 border-t pt-3">
              <p className="font-semibold">{tc("review.policyTitle")}</p>
              <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                {cancellationItems(snap.cancellationRules).map((c) => (
                  <li key={`${c.hours}-${c.percent}`}>
                    {tc(`cancellation.${c.key}`, { hours: c.hours, percent: c.percent })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <TripActions
            code={booking.code}
            locale={locale}
            canPay={holding}
            cancel={canCancel ? { refundPaise: refund.refundPaise, chargePaise: refund.chargePaise } : null}
            description={`${title} · ${booking.code}`}
          />
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("paymentTitle")}</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {items.map((item) => {
              const { label } = fareLineKey(item.line_key);
              const text =
                label === "addon" || label === "other"
                  ? item.description
                  : label === "allowance"
                    ? tc("lines.allowance", { days: item.quantity })
                    : tc(`lines.${label}`);
              return (
                <div key={item.id} className="contents">
                  <dt>{text}</dt>
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
                <dt className="font-semibold text-primary">{tc("review.payDriver")}</dt>
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
      </div>
    </div>
  );
}
