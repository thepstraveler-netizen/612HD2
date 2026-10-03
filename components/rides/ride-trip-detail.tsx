import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
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
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { getMyTrip } from "@/lib/bookings/trips";
import { customerCanCancel, type BookingStatus } from "@/lib/bookings/state";
import { cancellationItems, formatIndiaDateTime } from "@/lib/cabs/ui";
import { getIcon } from "@/lib/icons";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { quoteRefund } from "@/lib/refunds/policy";
import { canRateRide, rideAllowsCancel, rideLineKey, rideSnapshot, showRideOtp } from "@/lib/rides/ui";
import type { Tables } from "@/types/database";
import { RideRatingForm, RideStars } from "./ride-rating-form";
import { RideStatusBadge } from "./ride-status-badge";
import { RideTripActions } from "./ride-trip-actions";

/**
 * ride_requests columns the customer may read (driver_token and pickup_otp are
 * not granted; the OTP comes from rpc ride_otp).
 */
export const CUSTOMER_RIDE_COLUMNS =
  "id, status, pickup_address, drop_address, passengers, hours, pickup_at, distance_km, driver_name, driver_phone, vehicle_label, vehicle_registration, rating, rating_comment, rated_at" as const;

export type CustomerRideRow = Pick<
  Tables<"ride_requests">,
  | "status"
  | "pickup_address"
  | "drop_address"
  | "passengers"
  | "hours"
  | "pickup_at"
  | "distance_km"
  | "driver_name"
  | "driver_phone"
  | "vehicle_label"
  | "vehicle_registration"
  | "pickup_otp"
  | "rating"
  | "rating_comment"
  | "rated_at"
>;

/** A ride booking on My Trips: status, OTP, driver, fare, cancellation and the rating. */
export async function RideTripDetail({
  data,
  ride,
  locale,
  cancellationEnabled,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getMyTrip>>>;
  ride: CustomerRideRow | null;
  locale: string;
  cancellationEnabled: boolean;
}) {
  const t = await getTranslations("trips");
  const tr = await getTranslations("rides");
  const { booking, items, payments, refunds, invoice } = data;
  const status = booking.status as BookingStatus;
  const snap = rideSnapshot(booking.snapshot);
  const now = new Date();
  const pickupAt = ride?.pickup_at ? new Date(ride.pickup_at) : snap ? new Date(snap.ride.pickupAt) : null;
  const money = (paise: number) => formatPaise(paise, locale);
  const paidOnline = booking.payment_mode !== "pay_at_hotel";
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
    rideAllowsCancel(ride?.status ?? null);
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > now.getTime();
  const balance = Math.max(0, booking.total_paise - booking.paid_paise);
  const here = tr("search.myLocation");
  const from = snap ? pickLocalized(snap.ride.from.name, locale) || here : here;
  const to = snap?.ride.to ? pickLocalized(snap.ride.to.name, locale) || here : null;
  const title = snap
    ? snap.ride.mode === "hourly"
      ? tr("results.hourlyTitle", { hours: snap.ride.hours ?? ride?.hours ?? 0, from })
      : `${from} → ${to ?? ""}`
    : t("bookingId", { code: booking.code });
  const vehicle = snap ? pickLocalized(snap.ride.vehicleType.name, locale) : "";
  const Icon = getIcon(snap?.ride.vehicleType.icon ?? "bike");
  const live = status === "confirmed" && ride !== null;

  const banner =
    status === "confirmed" || status === "completed" ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
        <div>
          <p className="font-bold">
            {status === "completed"
              ? tr("trip.banner.completed")
              : tr(`trip.banner.${ride?.status ?? "requested"}`)}
          </p>
          <p className="text-sm text-muted-foreground">
            {status === "confirmed" && snap && !snap.ride.instantBook && ride?.status === "requested"
              ? tr("trip.onRequestHint")
              : balance > 0 && status === "confirmed"
                ? tr("trip.balanceToDriver", { amount: money(balance) })
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
              ? tr("trip.pendingHint", { time: formatIndiaDateTime(booking.expires_at, locale) })
              : t("pendingProcessing")}
          </p>
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3 rounded-2xl border bg-secondary p-4">
        <XCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-bold">
            {ride?.status === "no_show" ? tr("trip.banner.no_show") : t(`banner.${status}`)}
          </p>
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
            <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" /> {title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <BookingStatusBadge status={status} className="text-sm" />
          {live && ride ? <RideStatusBadge status={ride.status} className="text-sm" /> : null}
        </div>
      </div>
      {banner}

      {ride && showRideOtp(status, ride.status, ride.pickup_otp) ? (
        <section
          aria-labelledby="ride-otp"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4"
        >
          <div className="space-y-1">
            <h2 id="ride-otp" className="flex items-center gap-2 font-bold">
              <KeyRound className="size-5 text-primary" aria-hidden="true" /> {tr("trip.otpTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">{tr("trip.otpHint")}</p>
          </div>
          <p
            className="font-mono text-4xl font-extrabold tracking-[0.35em] text-heading"
            aria-label={tr("trip.otpAria", { otp: (ride.pickup_otp ?? "").split("").join(" ") })}
          >
            {ride.pickup_otp}
          </p>
        </section>
      ) : null}

      {live && ride?.driver_name ? (
        <section aria-labelledby="ride-driver" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 id="ride-driver" className="text-base font-bold">
            {tr("trip.driverTitle")}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{ride.driver_name}</p>
                <p className="text-muted-foreground">
                  {[ride.vehicle_label, ride.vehicle_registration].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {ride.driver_phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${ride.driver_phone.replace(/[^0-9+]/g, "")}`}>
                  <Phone /> {tr("trip.callDriver")}
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {ride && (ride.status === "completed" || ride.rating) ? (
        <section aria-label={tr("rating.title")} className="rounded-2xl border bg-card p-4 text-sm">
          {canRateRide(ride.status, ride.rated_at) ? (
            <RideRatingForm code={booking.code} />
          ) : ride.rating ? (
            <div className="space-y-1">
              <p className="font-bold">{tr("rating.given")}</p>
              <RideStars rating={ride.rating} label={tr("rating.starsAria", { count: ride.rating })} />
              {ride.rating_comment ? <p className="text-muted-foreground">“{ride.rating_comment}”</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            {pickupAt ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden="true" /> {tr("review.pickup")}
                </dt>
                <dd className="font-semibold">{formatIndiaDateTime(pickupAt, locale, true)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> {tr("review.passengers")}
              </dt>
              <dd className="font-semibold">{ride?.passengers ?? booking.adults}</dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5 text-accent-green" aria-hidden="true" /> {tr("trip.pickup")}
              </dt>
              <dd className="font-semibold">{from}</dd>
              {ride?.pickup_address ? <dd>{ride.pickup_address}</dd> : null}
            </div>
            {snap?.ride.mode === "point_to_point" ? (
              <div className="col-span-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 text-destructive" aria-hidden="true" /> {tr("trip.drop")}
                </dt>
                <dd className="font-semibold">{to}</dd>
                {ride?.drop_address ? <dd>{ride.drop_address}</dd> : null}
              </div>
            ) : null}
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" /> {tr("trip.vehicle")}
              </dt>
              <dd className="font-semibold">{vehicle}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Route className="size-3.5" aria-hidden="true" /> {tr("trip.length")}
              </dt>
              <dd className="font-semibold">
                {ride?.distance_km !== null && ride?.distance_km !== undefined
                  ? tr("trip.km", { km: Number(ride.distance_km) })
                  : tr("results.hoursLine", { hours: ride?.hours ?? snap?.ride.hours ?? 0 })}
              </dd>
            </div>
          </dl>

          {snap?.cancellationRules.length && paidOnline ? (
            <div className="space-y-1 border-t pt-3">
              <p className="font-semibold">{tr("review.policyTitle")}</p>
              <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                {cancellationItems(snap.cancellationRules).map((c) => (
                  <li key={`${c.hours}-${c.percent}`}>
                    {tr(`cancellation.${c.key}`, { hours: c.hours, percent: c.percent })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <RideTripActions
            code={booking.code}
            locale={locale}
            canPay={holding}
            cancel={
              canCancel
                ? {
                    paidOnline,
                    refundPaise: refund.refundPaise,
                    chargePaise: paidOnline ? refund.chargePaise : 0,
                  }
                : null
            }
            description={`${title} · ${booking.code}`}
          />
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("paymentTitle")}</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {items.map((item) => {
              const key = rideLineKey(item.line_key);
              return (
                <div key={item.id} className="contents">
                  <dt>{key === "other" ? item.description : tr(`lines.${key}`)}</dt>
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
                <dt className="font-semibold text-primary">{tr("review.payDriver")}</dt>
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
