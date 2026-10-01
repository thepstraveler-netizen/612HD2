import {
  Banknote,
  Car,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Route,
  UserRound,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DriverStepPanel } from "@/components/cabs/driver-step-panel";
import { TripStatusBadge } from "@/components/cabs/trip-status-badge";
import { Button } from "@/components/ui/button";
import { DRIVER_NEXT, getDriverTrip } from "@/lib/cabs/driver";
import { driverActions, formatIndiaDateTime, formatIndiaTime } from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import { formatPaise } from "@/lib/money";

type Props = { params: Promise<{ locale: string; token: string }> };

const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const tel = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/**
 * The driver's trip page, opened from the secret link sent at assignment.
 * The token is the only credential; an unknown or expired one shows the
 * "call the office" page with a 404.
 */
export default async function DriverTripPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const trip = hasServiceRole() && /^[0-9a-f]{48}$/.test(token) ? await getDriverTrip(token) : null;
  if (!trip) notFound();
  const t = await getTranslations("driverTrip");
  const business = await getBusinessInfo();
  const actions = driverActions(DRIVER_NEXT[trip.status] ?? [], trip.requireOtp);
  const stops = Array.isArray(trip.stops) ? trip.stops.filter((s): s is string => typeof s === "string") : [];
  const finished = trip.status === "completed" || trip.status === "no_show" || trip.status === "cancelled";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("booking", { code: trip.code })}</p>
        <TripStatusBadge status={trip.status} className="text-sm" />
      </div>

      <section aria-labelledby="pickup-time" className="rounded-2xl bg-brand-navy p-5 text-white">
        <p className="text-sm opacity-80">{t("pickupAt")}</p>
        <p id="pickup-time" className="text-5xl font-extrabold tracking-tight">
          {formatIndiaTime(trip.pickup_at, locale)}
        </p>
        <p className="mt-1 font-medium">{formatIndiaDateTime(trip.pickup_at, locale, true)}</p>
        {trip.return_at ? (
          <p className="mt-2 text-sm opacity-80">
            {t("returnAt", { time: formatIndiaDateTime(trip.return_at, locale, true) })}
          </p>
        ) : null}
      </section>

      {finished ? (
        <p className="flex items-center gap-2 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4 font-semibold">
          <CheckCircle2 className="size-5 text-accent-green" aria-hidden="true" />{" "}
          {t(`finished.${trip.status}`)}
        </p>
      ) : (
        <DriverStepPanel token={token} actions={actions} />
      )}

      <section aria-labelledby="customer" className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 id="customer" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("customer")}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-lg font-bold">
            <UserRound className="size-5 text-primary" aria-hidden="true" /> {trip.customerName}
          </p>
          <Button asChild size="lg" className="h-12">
            <a href={tel(trip.customerPhone)} aria-label={t("callCustomer", { name: trip.customerName })}>
              <Phone /> {t("call")}
            </a>
          </Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden="true" /> {t("passengers", { count: trip.passengers })}
        </p>
      </section>

      <section aria-labelledby="where" className="space-y-4 rounded-2xl border bg-card p-4">
        <h2 id="where" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("where")}
        </h2>
        <div className="space-y-2">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-5 shrink-0 text-accent-green" aria-hidden="true" />
            <span>
              <span className="block text-xs text-muted-foreground">{t("pickupAddress")}</span>
              <span className="font-semibold">{trip.pickup_address}</span>
            </span>
          </p>
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={mapsLink(trip.pickup_address)} target="_blank" rel="noreferrer">
              <Navigation /> {t("openMaps")}
            </a>
          </Button>
        </div>
        {trip.drop_address ? (
          <div className="space-y-2 border-t pt-3">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <span>
                <span className="block text-xs text-muted-foreground">{t("dropAddress")}</span>
                <span className="font-semibold">{trip.drop_address}</span>
              </span>
            </p>
            <Button asChild variant="outline" className="h-12 w-full">
              <a href={mapsLink(trip.drop_address)} target="_blank" rel="noreferrer">
                <Navigation /> {t("openMaps")}
              </a>
            </Button>
          </div>
        ) : null}
        {trip.route ? (
          <p className="flex items-start gap-2 border-t pt-3 text-sm">
            <Route className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {trip.route}
              {trip.distance_km ? ` · ${t("km", { km: trip.distance_km })}` : null}
            </span>
          </p>
        ) : null}
        {stops.length ? (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">{t("stops")}</p>
            <ol className="list-decimal ps-5">
              {stops.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {trip.vehicle_label || trip.vehicle_registration ? (
          <p className="flex items-center gap-2 border-t pt-3 text-sm">
            <Car className="size-4 text-primary" aria-hidden="true" />
            {[trip.vehicle_label, trip.vehicle_registration].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="cash"
        className={
          trip.balancePaise > 0
            ? "rounded-2xl border-2 border-accent-orange bg-accent-orange/10 p-4"
            : "rounded-2xl border bg-card p-4"
        }
      >
        <h2 id="cash" className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="size-5" aria-hidden="true" /> {t("cashTitle")}
        </h2>
        {trip.balancePaise > 0 ? (
          <>
            <p className="text-3xl font-extrabold">{formatPaise(trip.balancePaise, locale)}</p>
            <p className="text-sm text-muted-foreground">{t("cashHint")}</p>
          </>
        ) : (
          <p className="font-semibold">{t("nothingToCollect")}</p>
        )}
      </section>

      {business.phone ? (
        <Button asChild variant="ghost" className="w-full">
          <a href={tel(business.phone)}>
            <Phone /> {t("callOffice")}
          </a>
        </Button>
      ) : null}
    </>
  );
}
