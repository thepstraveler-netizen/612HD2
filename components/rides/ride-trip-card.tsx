import { CalendarDays, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { Link } from "@/i18n/navigation";
import type { BookingStatus } from "@/lib/bookings/state";
import { formatIndiaDateTime } from "@/lib/cabs/ui";
import { getIcon } from "@/lib/icons";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import type { RideSnapshot, RideStatus } from "@/lib/rides/ui";
import { RideStatusBadge } from "./ride-status-badge";

/** A ride booking in the My Trips list. */
export function RideTripCard({
  code,
  status,
  totalPaise,
  ride,
  rideStatus,
  locale,
}: {
  code: string;
  status: string;
  totalPaise: number;
  ride: RideSnapshot["ride"];
  rideStatus?: RideStatus | null;
  locale: string;
}) {
  const t = useTranslations("trips");
  const tr = useTranslations("rides");
  const Icon = getIcon(ride.vehicleType.icon);
  const from = pickLocalized(ride.from.name, locale);
  const title =
    ride.mode === "hourly"
      ? tr("results.hourlyTitle", { hours: ride.hours ?? 0, from })
      : `${from} → ${ride.to ? pickLocalized(ride.to.name, locale) : ""}`;
  return (
    <Link
      href={`/account/trips/${code}`}
      className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStatusBadge status={status as BookingStatus} />
          {rideStatus && status === "confirmed" ? <RideStatusBadge status={rideStatus} /> : null}
          <span className="text-xs text-muted-foreground">{t("bookingId", { code })}</span>
        </div>
        <p className="flex items-center gap-1.5 truncate font-bold">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden="true" />
          {formatIndiaDateTime(ride.pickupAt, locale, true)} · {pickLocalized(ride.vehicleType.name, locale)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-extrabold">{formatPaise(totalPaise, locale)}</span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}
