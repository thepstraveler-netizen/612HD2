import {
  CalendarDays,
  Car,
  ChevronRight,
  Map as MapIcon,
  Pill,
  Plane,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { TripStatusBadge } from "@/components/cabs/trip-status-badge";
import { Link } from "@/i18n/navigation";
import { cabSnapshot, formatIndiaDateTime, type TripStatus } from "@/lib/cabs/ui";
import type { BookingStatus } from "@/lib/bookings/state";
import type { TripSummary } from "@/lib/bookings/trips";
import { orderSnapshot } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { packageSnapshot, quoteSnapshot } from "@/lib/packages/ui";
import { BookingStatusBadge } from "./status-badge";

export function formatStayDate(date: string | null, locale: string): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function TripCard({
  trip,
  locale,
  tripStatus,
}: {
  trip: TripSummary;
  locale: string;
  /** Cab bookings: where the trip stands. */
  tripStatus?: TripStatus | null;
}) {
  const t = useTranslations("trips");
  const to = useTranslations("orderTrip");
  const order = orderSnapshot(trip.snapshot);
  if (order) {
    const OrderIcon =
      order.order.store.kind === "pharmacy"
        ? Pill
        : order.order.store.kind === "grocery"
          ? ShoppingBasket
          : UtensilsCrossed;
    return (
      <Link
        href={`/account/trips/${trip.code}`}
        className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={trip.status as BookingStatus} />
            <span className="text-xs text-muted-foreground">{to("orderId", { code: trip.code })}</span>
          </div>
          <p className="flex items-start gap-1.5 leading-snug font-bold">
            <OrderIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="line-clamp-2 break-words">{pickLocalized(order.order.store.name, locale)}</span>
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            {formatIndiaDateTime(trip.created_at, locale, true)}
            {order.order.itemCount ? ` · ${to("itemCount", { count: order.order.itemCount })}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-extrabold">{formatPaise(trip.total_paise, locale)}</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </Link>
    );
  }
  const cab = cabSnapshot(trip.snapshot);
  if (cab) {
    const car = cab.category?.name ? pickLocalized(cab.category.name, locale) : cab.trip.vehicle;
    return (
      <Link
        href={`/account/trips/${trip.code}`}
        className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={trip.status as BookingStatus} />
            {tripStatus && trip.status === "confirmed" ? <TripStatusBadge status={tripStatus} /> : null}
            <span className="text-xs text-muted-foreground">{t("bookingId", { code: trip.code })}</span>
          </div>
          <p className="flex items-start gap-1.5 leading-snug font-bold">
            <Car className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="line-clamp-2 break-words">{cab.trip.route || cab.trip.label}</span>
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            {formatIndiaDateTime(cab.trip.pickupAt, locale, true)}
            {car ? ` · ${car}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-extrabold">{formatPaise(trip.total_paise, locale)}</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </Link>
    );
  }
  const pkg = packageSnapshot(trip.snapshot);
  const quote = pkg ? null : quoteSnapshot(trip.snapshot);
  if (pkg || quote) {
    // Tour packages booked online, and flights / trains / buses or custom tours paid from a quote.
    const Icon = pkg || quote?.lead?.kind === "package" ? MapIcon : Plane;
    const title = pkg ? pickLocalized(pkg.package.title, locale) : (quote?.quote.title ?? "");
    return (
      <Link
        href={`/account/trips/${trip.code}`}
        className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={trip.status as BookingStatus} />
            <span className="text-xs text-muted-foreground">{t("bookingId", { code: trip.code })}</span>
          </div>
          <p className="flex items-start gap-1.5 leading-snug font-bold">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="line-clamp-2 break-words">{title}</span>
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            {pkg
              ? `${formatStayDate(pkg.package.startDate, locale)} – ${formatStayDate(pkg.package.endDate, locale)}`
              : trip.check_in
                ? formatStayDate(trip.check_in, locale)
                : formatIndiaDateTime(trip.created_at, locale, true)}
            {quote?.trip?.route ? ` · ${quote.trip.route}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-extrabold">{formatPaise(trip.total_paise, locale)}</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={`/account/trips/${trip.code}`}
      className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStatusBadge status={trip.status as BookingStatus} />
          <span className="text-xs text-muted-foreground">{t("bookingId", { code: trip.code })}</span>
        </div>
        <p className="line-clamp-2 leading-snug font-bold break-words">
          {pickLocalized(trip.snapshot.hotel?.name, locale)}
        </p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          {formatStayDate(trip.check_in, locale)} – {formatStayDate(trip.check_out, locale)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-extrabold">{formatPaise(trip.total_paise, locale)}</span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}
