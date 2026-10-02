import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  MapPin,
  Phone,
  Pill,
  ShoppingBasket,
  Store as StoreIcon,
  UserRound,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { TripActions } from "@/components/booking/trip-actions";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { BookingStatus } from "@/lib/bookings/state";
import type { getMyTrip } from "@/lib/bookings/trips";
import { formatIndiaDateTime, formatIndiaTime } from "@/lib/cabs/ui";
import { customerCanCancel, canRate, TRACK_STEPS, trackIndex } from "@/lib/delivery/status";
import {
  addressLine,
  dietOf,
  orderAddress,
  orderIsLive,
  orderItemAddons,
  orderLineKey,
  orderSnapshot,
  showDeliveryOtp,
} from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DeliverySettings } from "@/schemas/delivery";
import type { Tables } from "@/types/database";
import { AutoRefresh } from "./auto-refresh";
import { DietMark } from "./diet-mark";
import { OrderRatingForm } from "./order-rating-form";
import { OrderStatusBadge } from "./status-badges";

/**
 * orders columns the customer reads. Never partner_token (no column grant)
 * nor delivery_otp (read through the my_order_otp RPC instead).
 */
export const CUSTOMER_ORDER_COLUMNS =
  "id, kind, status, address, eta_at, placed_at, accepted_at, ready_at, picked_up_at, delivered_at, partner_name, partner_phone, prescription_id, rating, rating_comment, rated_at" as const;

export type CustomerOrderRow = Pick<
  Tables<"orders">,
  | "id"
  | "kind"
  | "status"
  | "address"
  | "eta_at"
  | "placed_at"
  | "accepted_at"
  | "ready_at"
  | "picked_up_at"
  | "delivered_at"
  | "partner_name"
  | "partner_phone"
  | "prescription_id"
  | "rating"
  | "rating_comment"
  | "rated_at"
>;

export type CustomerOrderItem = Pick<
  Tables<"order_items">,
  "id" | "name" | "variant_name" | "addons" | "diet" | "quantity" | "unit_price_paise" | "line_total_paise"
>;

const KIND_ICON = { restaurant: UtensilsCrossed, grocery: ShoppingBasket, pharmacy: Pill } as const;

/** A food, essentials or medicine order on My Trips: live tracker, OTP, rider, items, bill, cancel and rating. */
export async function OrderTripDetail({
  data,
  order,
  items,
  otp,
  settings,
  locale,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getMyTrip>>>;
  order: CustomerOrderRow | null;
  items: CustomerOrderItem[];
  otp: string | null;
  settings: Pick<DeliverySettings, "cancel_until" | "require_delivery_otp">;
  locale: string;
}) {
  const t = await getTranslations("trips");
  const to = await getTranslations("orderTrip");
  const ts = await getTranslations("shop");
  const { booking, items: priceLines, payments, refunds, invoice } = data;
  const status = booking.status as BookingStatus;
  const snap = orderSnapshot(booking.snapshot);
  const money = (paise: number) => formatPaise(paise, locale);
  const now = new Date();
  const storeName = snap
    ? pickLocalized(snap.order.store.name, locale)
    : t("bookingId", { code: booking.code });
  const Icon = KIND_ICON[order?.kind ?? snap?.order.store.kind ?? "restaurant"];
  const address = order ? orderAddress(order.address) : null;
  const holding =
    status === "pending_payment" &&
    booking.expires_at !== null &&
    Date.parse(booking.expires_at) > now.getTime();
  const canCancel =
    order !== null &&
    (status === "confirmed" || status === "pending_payment") &&
    customerCanCancel(order.status, settings);
  const reached = order ? trackIndex(order.status) : -1;
  const ended =
    order?.status === "cancelled" ||
    order?.status === "rejected" ||
    (status !== "confirmed" && status !== "completed" && status !== "pending_payment");
  const live = order !== null && orderIsLive(order.status) && !ended;
  const paidOnline = booking.payment_mode !== "pay_at_hotel";
  const balance = Math.max(0, booking.total_paise - booking.paid_paise);
  const stepTimes: Partial<Record<(typeof TRACK_STEPS)[number], string | null>> = order
    ? {
        placed: order.placed_at,
        accepted: order.accepted_at,
        out_for_delivery: order.picked_up_at,
        delivered: order.delivered_at,
      }
    : {};

  const banner =
    status === "pending_payment" ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4">
        <Clock className="size-6 shrink-0 text-accent-orange" aria-hidden="true" />
        <div>
          <p className="font-bold">{t("bannerPending")}</p>
          <p className="text-sm text-muted-foreground">
            {holding && booking.expires_at
              ? to("pendingHint", { time: formatIndiaTime(booking.expires_at, locale) })
              : t("pendingProcessing")}
          </p>
        </div>
      </div>
    ) : ended ? (
      <div className="flex items-start gap-3 rounded-2xl border bg-secondary p-4">
        <XCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-bold">
            {order?.status === "rejected" ? to("banner.rejected") : t(`banner.${status}`)}
          </p>
          {booking.refunded_paise > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("refundedAmount", { amount: money(booking.refunded_paise) })}
            </p>
          ) : null}
        </div>
      </div>
    ) : order ? (
      <div className="flex items-start gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
        <div>
          <p className="font-bold">{to(`banner.${order.status}`)}</p>
          <p className="text-sm text-muted-foreground">
            {order.status === "delivered"
              ? order.delivered_at
                ? to("deliveredAt", { time: formatIndiaDateTime(order.delivered_at, locale) })
                : null
              : order.eta_at
                ? to("eta", { time: formatIndiaTime(order.eta_at, locale) })
                : null}
            {order.status !== "delivered" && balance > 0 && !paidOnline
              ? ` ${to("payOnDelivery", { amount: money(balance) })}`
              : null}
          </p>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {live ? <AutoRefresh seconds={20} /> : null}
      <Link
        href="/account/trips"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("allTrips")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{to("orderId", { code: booking.code })}</p>
          <h1 className="flex items-center gap-2 text-[length:var(--text-title)] leading-tight font-bold">
            <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" /> {storeName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <BookingStatusBadge status={status} className="text-sm" />
          {order && status === "confirmed" ? (
            <OrderStatusBadge status={order.status} className="text-sm" />
          ) : null}
        </div>
      </div>
      {banner}

      {order && !ended && reached >= 0 ? (
        <section aria-labelledby="order-track" className="rounded-2xl border bg-card p-4">
          <h2 id="order-track" className="sr-only">
            {to("trackerTitle")}
          </h2>
          <ol className="grid grid-cols-5 gap-1">
            {TRACK_STEPS.map((step, i) => {
              const done = i <= reached;
              const at = stepTimes[step];
              return (
                <li
                  key={step}
                  className="relative flex flex-col items-center gap-1.5 text-center text-[11px] sm:text-xs"
                  aria-current={i === reached ? "step" : undefined}
                >
                  {i > 0 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-4 right-1/2 -z-0 h-0.5 w-full",
                        done ? "bg-accent-green" : "bg-border",
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 grid size-8 place-items-center rounded-full border-2",
                      done
                        ? "border-accent-green bg-accent-green text-white"
                        : "border-border bg-card text-muted-foreground",
                      i === reached && live && "ring-4 ring-accent-green/20",
                    )}
                  >
                    {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={cn(done ? "font-semibold" : "text-muted-foreground")}>
                    {to(`steps.${step}`)}
                  </span>
                  {done && at ? (
                    <span className="text-muted-foreground">{formatIndiaTime(at, locale)}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {live ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">{to("autoRefresh")}</p>
          ) : null}
        </section>
      ) : null}

      {order && otp && showDeliveryOtp(status, order.status, otp) ? (
        <section
          aria-labelledby="order-otp"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4"
        >
          <div className="space-y-1">
            <h2 id="order-otp" className="flex items-center gap-2 font-bold">
              <KeyRound className="size-5 text-primary" aria-hidden="true" /> {to("otpTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {settings.require_delivery_otp ? to("otpHint") : to("otpHintOptional")}
            </p>
          </div>
          <p
            className="font-mono text-4xl font-extrabold tracking-[0.35em] text-heading"
            aria-label={to("otpAria", { otp: otp.split("").join(" ") })}
          >
            {otp}
          </p>
        </section>
      ) : null}

      {order?.partner_name && !ended && order.status !== "delivered" ? (
        <section aria-labelledby="order-rider" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 id="order-rider" className="text-base font-bold">
            {to("riderTitle")}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <p className="font-semibold">{order.partner_name}</p>
            </div>
            {order.partner_phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${order.partner_phone.replace(/[^0-9+]/g, "")}`}>
                  <Phone /> {to("callRider")}
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {order && (order.status === "delivered" || order.rating) ? (
        <section aria-label={to("rating.title")} className="rounded-2xl border bg-card p-4 text-sm">
          {canRate(order.status, order.rated_at) ? (
            <OrderRatingForm code={booking.code} />
          ) : order.rating ? (
            <div className="space-y-1">
              <p className="font-bold">{to("rating.given", { count: order.rating })}</p>
              {order.rating_comment ? (
                <p className="text-muted-foreground">“{order.rating_comment}”</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">
            {to("itemsTitle", { count: items.reduce((s, i) => s + i.quantity, 0) })}
          </h2>
          <ul className="divide-y">
            {items.map((item) => {
              const diet = dietOf(item.diet);
              const addons = orderItemAddons(item.addons);
              return (
                <li key={item.id} className="flex items-start gap-3 py-2">
                  {diet ? <DietMark diet={diet} label={ts(`diet.${diet}`)} className="mt-0.5" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {item.quantity} × {item.name}
                      {item.variant_name ? ` (${item.variant_name})` : ""}
                    </p>
                    {addons.length ? (
                      <p className="text-xs text-muted-foreground">+ {addons.join(", ")}</p>
                    ) : null}
                  </div>
                  <span className="font-semibold">{money(item.line_total_paise)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="grid gap-3 border-t pt-3">
            {snap ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <StoreIcon className="size-3.5" aria-hidden="true" /> {to("store")}
                </dt>
                <dd className="font-semibold">
                  {snap.order.store.slug && snap.order.store.kind !== "pharmacy" ? (
                    <Link
                      href={`/${snap.order.store.kind === "restaurant" ? "food" : "essentials"}/${snap.order.store.slug}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {storeName}
                    </Link>
                  ) : (
                    storeName
                  )}
                </dd>
                {snap.order.store.phone && live ? (
                  <dd>
                    <a
                      href={`tel:${snap.order.store.phone.replace(/[^0-9+]/g, "")}`}
                      className="text-primary"
                    >
                      {to("callStore")}
                    </a>
                  </dd>
                ) : null}
              </div>
            ) : null}
            {address ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" /> {to("deliverTo")}
                </dt>
                <dd>
                  {address.contact_name} · {address.phone}
                </dd>
                <dd className="text-muted-foreground">
                  {addressLine(address)}
                  {snap?.order.zone ? ` · ${pickLocalized(snap.order.zone.name, locale)}` : ""}
                </dd>
              </div>
            ) : null}
            {order?.prescription_id ? (
              <div>
                <dt className="text-xs text-muted-foreground">{to("prescription")}</dt>
                <dd>
                  <Link
                    href={`/account/prescriptions/${order.prescription_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {to("viewPrescription")}
                  </Link>
                </dd>
              </div>
            ) : null}
            {booking.special_requests ? (
              <div>
                <dt className="text-xs text-muted-foreground">{to("notes")}</dt>
                <dd>{booking.special_requests}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">{to("placedAt")}</dt>
              <dd>{formatIndiaDateTime(order?.placed_at ?? booking.created_at, locale, true)}</dd>
            </div>
          </dl>

          <TripActions
            code={booking.code}
            locale={locale}
            canPay={holding}
            cancel={
              canCancel
                ? { refundPaise: Math.max(0, booking.paid_paise - booking.refunded_paise), chargePaise: 0 }
                : null
            }
            description={`${snap?.order.store.name.en ?? storeName} · ${booking.code}`}
          />
          {canCancel ? <p className="text-xs text-muted-foreground">{to("cancelHint")}</p> : null}
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("paymentTitle")}</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {(() => {
              const itemsTotal = priceLines
                .filter((l) => orderLineKey(l.line_key) === "items")
                .reduce((s, l) => s + l.amount_paise, 0);
              return (
                <>
                  {itemsTotal ? (
                    <>
                      <dt>{ts("lines.items")}</dt>
                      <dd className="text-right">{money(itemsTotal)}</dd>
                    </>
                  ) : null}
                  {priceLines
                    .filter((l) => orderLineKey(l.line_key) !== "items")
                    .map((l) => {
                      const key = orderLineKey(l.line_key);
                      return (
                        <div key={l.id} className="contents">
                          <dt>{key === "other" ? l.description : ts(`lines.${key}`)}</dt>
                          <dd className="text-right">{money(l.amount_paise)}</dd>
                        </div>
                      );
                    })}
                </>
              );
            })()}
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
                <dt className="font-semibold text-primary">{to("cashOnDelivery")}</dt>
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
