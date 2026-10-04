import { ArrowLeft, CheckCircle2, Clock, Download, MapPin, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { formatStayDate } from "@/components/booking/trip-card";
import { TripActions } from "@/components/booking/trip-actions";
import { CabTripDetail } from "@/components/cabs/cab-trip-detail";
import { CUSTOMER_ORDER_COLUMNS, OrderTripDetail } from "@/components/delivery/order-trip-detail";
import { PackageTripDetail, QuoteTripDetail } from "@/components/packages/package-trip-detail";
import { CUSTOMER_RIDE_COLUMNS, RideTripDetail } from "@/components/rides/ride-trip-detail";
import { TripReview } from "@/components/reviews/trip-review";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getPaymentSettings } from "@/lib/bookings/settings";
import { customerCanCancel, type BookingStatus } from "@/lib/bookings/state";
import { getMyTrip } from "@/lib/bookings/trips";
import { getDeliverySettings } from "@/lib/delivery/queries";
import { cancellationText } from "@/lib/hotels/policy-text";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { packageSnapshot } from "@/lib/packages/ui";
import { checkInInstant, quoteRefund } from "@/lib/refunds/policy";
import { getTripReviewState } from "@/lib/reviews/trips";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const t = await getTranslations("trips");
  return { title: t("bookingId", { code }), robots: { index: false } };
}

export default async function TripPage({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const session = await requireUser(`/account/trips/${code}`);
  if (!/^[A-Z0-9]{6,16}$/.test(code)) notFound();
  const trip = await getMyTrip(session.user.id, code);
  if (!trip) notFound();
  const [settings, reviewState] = await Promise.all([
    getPaymentSettings(),
    getTripReviewState(session.user.id, trip.booking.id),
  ]);
  const review = <TripReview state={reviewState} code={trip.booking.code} locale={locale} />;
  // Service-specific detail views, with the review card below them.
  const withReview = (detail: ReactNode) => (
    <div className="space-y-6">
      {detail}
      {review}
    </div>
  );
  if (trip.booking.service === "cab") {
    const supabase = await createClient();
    const { data: cabRow } = await supabase
      .from("trips")
      .select(
        "id, status, pickup_address, drop_address, passengers, driver_name, driver_phone, vehicle_label, vehicle_registration",
      )
      .eq("booking_id", trip.booking.id)
      .maybeSingle();
    // The pickup OTP is only returned to the customer who booked (D-098).
    const cabOtp = cabRow ? (await supabase.rpc("trip_otp", { p_trip_id: cabRow.id })).data : null;
    const cabTrip = cabRow ? { ...cabRow, pickup_otp: cabOtp ?? null } : null;
    return withReview(
      <CabTripDetail
        data={trip}
        trip={cabTrip}
        locale={locale}
        cancellationEnabled={settings.customer_cancellation_enabled}
      />,
    );
  }
  if (trip.booking.service === "ride") {
    const supabase = await createClient();
    // Explicit columns: the driver link token is not readable by customers.
    const { data: rideRow } = await supabase
      .from("ride_requests")
      .select(CUSTOMER_RIDE_COLUMNS)
      .eq("booking_id", trip.booking.id)
      .maybeSingle();
    const rideOtp = rideRow ? (await supabase.rpc("ride_otp", { p_ride_id: rideRow.id })).data : null;
    const ride = rideRow ? { ...rideRow, pickup_otp: rideOtp ?? null } : null;
    return withReview(
      <RideTripDetail
        data={trip}
        ride={ride}
        locale={locale}
        cancellationEnabled={settings.customer_cancellation_enabled}
      />,
    );
  }
  if (
    trip.booking.service === "food" ||
    trip.booking.service === "essentials" ||
    trip.booking.service === "medicine"
  ) {
    const supabase = await createClient();
    // Explicit columns: the rider link token and the OTP are not readable directly.
    const [{ data: order }, deliverySettings] = await Promise.all([
      supabase.from("orders").select(CUSTOMER_ORDER_COLUMNS).eq("booking_id", trip.booking.id).maybeSingle(),
      getDeliverySettings(),
    ]);
    const [{ data: orderItems }, { data: otp }] = order
      ? await Promise.all([
          supabase
            .from("order_items")
            .select("id, name, variant_name, addons, diet, quantity, unit_price_paise, line_total_paise")
            .eq("order_id", order.id)
            .order("sort_order"),
          // Only the customer who placed the order gets its delivery OTP.
          supabase.rpc("my_order_otp", { p_order_id: order.id }),
        ])
      : [{ data: [] }, { data: null }];
    return withReview(
      <OrderTripDetail
        data={trip}
        order={order}
        items={orderItems ?? []}
        otp={otp ?? null}
        settings={deliverySettings}
        locale={locale}
      />,
    );
  }
  if (trip.booking.service === "package" || trip.booking.service === "travel") {
    // Booked online on the package checkout, or paid from an agent's quote.
    if (packageSnapshot(trip.booking.snapshot)) {
      const supabase = await createClient();
      const { data: row } = await supabase
        .from("package_bookings")
        .select("travellers, pickup_point")
        .eq("booking_id", trip.booking.id)
        .maybeSingle();
      return withReview(<PackageTripDetail data={trip} row={row} locale={locale} />);
    }
    return withReview(<QuoteTripDetail data={trip} locale={locale} />);
  }
  const t = await getTranslations("trips");
  const th = await getTranslations("hotels");

  const { booking, items, guests, payments, refunds, invoice } = trip;
  const status = booking.status as BookingStatus;
  const { hotel, room, plan } = booking.snapshot;
  const now = new Date();
  const checkInAt = checkInInstant(booking.check_in ?? "1970-01-01", hotel?.checkInTime ?? "12:00");
  const refund = quoteRefund({
    rules: plan?.cancellationRules ?? [],
    isRefundable: plan?.isRefundable ?? false,
    checkInAt,
    now,
    totalPaise: booking.total_paise,
    paidPaise: booking.paid_paise,
    refundedPaise: booking.refunded_paise,
  });
  const canCancel = settings.customer_cancellation_enabled && customerCanCancel(status, checkInAt, now);
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > now.getTime();
  const addons = items.filter((i) => i.kind === "addon");
  const fees = items.filter((i) => i.kind === "fee").reduce((s, i) => s + i.amount_paise, 0);
  const roomTotal = items
    .filter((i) => i.kind === "room" || i.kind === "extra_guest")
    .reduce((s, i) => s + i.amount_paise, 0);
  const hotelName = pickLocalized(hotel?.name, locale);
  const tCancel = (key: string, values?: Record<string, string | number>) => th(`detail.${key}`, values);
  const dateTime = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  const banner =
    status === "confirmed" || status === "completed" ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
        <div>
          <p className="font-bold">{t(status === "completed" ? "bannerCompleted" : "bannerConfirmed")}</p>
          <p className="text-sm text-muted-foreground">
            {booking.paid_paise < booking.total_paise
              ? t("balanceAtHotel", { amount: formatPaise(booking.total_paise - booking.paid_paise, locale) })
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
              ? t("pendingHint", { time: dateTime.format(new Date(booking.expires_at)) })
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
              {t("refundedAmount", { amount: formatPaise(booking.refunded_paise, locale) })}
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
          <h1 className="text-[length:var(--text-title)] leading-tight font-bold break-words">{hotelName}</h1>
        </div>
        <BookingStatusBadge status={status} className="text-sm" />
      </div>
      {banner}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          {hotel?.address ? (
            <p className="flex items-start gap-1 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {hotel.address}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("checkIn")}</dt>
              <dd className="font-semibold">{formatStayDate(booking.check_in, locale)}</dd>
              <dd className="text-xs text-muted-foreground">{hotel?.checkInTime}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("checkOut")}</dt>
              <dd className="font-semibold">{formatStayDate(booking.check_out, locale)}</dd>
              <dd className="text-xs text-muted-foreground">{hotel?.checkOutTime}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">{t("room")}</dt>
              <dd className="font-semibold">
                {booking.rooms} × {pickLocalized(room?.name, locale)} · {pickLocalized(plan?.name, locale)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">{t("guests")}</dt>
              <dd>{guests.map((g) => g.full_name).join(", ")}</dd>
            </div>
          </dl>
          <p className={plan?.isRefundable ? "text-accent-green" : "text-muted-foreground"}>
            {cancellationText(plan?.cancellationRules ?? [], plan?.isRefundable ?? false, tCancel)}
          </p>
          <TripActions
            code={booking.code}
            locale={locale}
            canPay={holding}
            cancel={canCancel ? { refundPaise: refund.refundPaise, chargePaise: refund.chargePaise } : null}
            description={`${hotelName} · ${booking.code}`}
          />
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("paymentTitle")}</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt>{t("roomCharges")}</dt>
            <dd className="text-right">{formatPaise(roomTotal, locale)}</dd>
            {addons.map((a) => (
              <div key={a.id} className="contents">
                <dt>{a.description}</dt>
                <dd className="text-right">{formatPaise(a.amount_paise, locale)}</dd>
              </div>
            ))}
            {fees ? (
              <>
                <dt>{t("fees")}</dt>
                <dd className="text-right">{formatPaise(fees, locale)}</dd>
              </>
            ) : null}
            {booking.discount_paise ? (
              <>
                <dt className="text-accent-green">{t("discount", { code: booking.coupon_code ?? "" })}</dt>
                <dd className="text-right text-accent-green">
                  − {formatPaise(booking.discount_paise, locale)}
                </dd>
              </>
            ) : null}
            <dt>{t("taxes")}</dt>
            <dd className="text-right">{formatPaise(booking.tax_paise, locale)}</dd>
            <dt className="border-t pt-2 font-bold">{t("total")}</dt>
            <dd className="border-t pt-2 text-right font-extrabold">
              {formatPaise(booking.total_paise, locale)}
            </dd>
            <dt>{t("paid")}</dt>
            <dd className="text-right">{formatPaise(booking.paid_paise, locale)}</dd>
            {booking.refunded_paise ? (
              <>
                <dt>{t("refunded")}</dt>
                <dd className="text-right">{formatPaise(booking.refunded_paise, locale)}</dd>
              </>
            ) : null}
          </dl>
          {payments.filter(
            (p) => p.status === "captured" || p.status === "partially_refunded" || p.status === "refunded",
          ).length ? (
            <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {payments
                .filter((p) => p.captured_at)
                .map((p) => (
                  <li key={p.id}>
                    {t("paymentLine", {
                      amount: formatPaise(p.amount_paise, locale),
                      method: p.method ?? p.provider,
                      date: dateTime.format(new Date(p.captured_at as string)),
                    })}
                  </li>
                ))}
              {refunds.map((r, i) => (
                <li key={i}>
                  {t("refundLine", {
                    amount: formatPaise(r.amount_paise, locale),
                    status: t(`refundStatus.${r.status}`),
                  })}
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
      {review}
    </div>
  );
}
