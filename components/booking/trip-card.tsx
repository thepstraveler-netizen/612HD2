import { CalendarDays, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BookingStatus } from "@/lib/bookings/state";
import type { TripSummary } from "@/lib/bookings/trips";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
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

export function TripCard({ trip, locale }: { trip: TripSummary; locale: string }) {
  const t = useTranslations("trips");
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
        <p className="truncate font-bold">{pickLocalized(trip.snapshot.hotel?.name, locale)}</p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden="true" />
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
