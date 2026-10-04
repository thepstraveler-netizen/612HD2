import {
  Banknote,
  Bike,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Route,
  UserRound,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RideDriverPanel } from "@/components/rides/ride-driver-panel";
import { RideStatusBadge } from "@/components/rides/ride-status-badge";
import { Button } from "@/components/ui/button";
import { formatIndiaDateTime, formatIndiaTime } from "@/lib/cabs/ui";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { hasServiceRole } from "@/lib/env.server";
import { formatPaise } from "@/lib/money";
import { getDriverRide, RIDE_DRIVER_NEXT } from "@/lib/rides/driver";
import { rideDriverActions } from "@/lib/rides/ui";

type Props = { params: Promise<{ locale: string; token: string }> };

const tel = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;
const whatsapp = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

/**
 * The driver's ride page, opened from the secret link sent at assignment.
 * The token is the only credential; an unknown or expired one shows the
 * "call the office" page with a 404.
 */
export default async function DriverRidePage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const ride = hasServiceRole() && /^[0-9a-f]{48}$/.test(token) ? await getDriverRide(token) : null;
  if (!ride) notFound();
  const t = await getTranslations("rides.driver");
  const business = await getBusinessInfo();
  const actions = rideDriverActions(RIDE_DRIVER_NEXT[ride.status] ?? [], ride.requireOtp);
  const finished = ride.status === "completed" || ride.status === "no_show" || ride.status === "cancelled";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("booking", { code: ride.code })}</p>
        <RideStatusBadge status={ride.status} className="text-sm" />
      </div>

      <section aria-labelledby="pickup-time" className="rounded-2xl bg-brand-navy p-5 text-white">
        <p className="text-sm opacity-80">{t("pickupAt")}</p>
        <p id="pickup-time" className="text-5xl font-extrabold tracking-tight">
          {formatIndiaTime(ride.pickup_at, locale)}
        </p>
        <p className="mt-1 font-medium">{formatIndiaDateTime(ride.pickup_at, locale, true)}</p>
        {ride.mode === "hourly" && ride.hours ? (
          <p className="mt-2 text-sm opacity-80">{t("hourly", { hours: ride.hours })}</p>
        ) : null}
      </section>

      {finished ? (
        <p className="flex items-center gap-2 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4 font-semibold">
          <CheckCircle2 className="size-5 text-accent-green" aria-hidden="true" />{" "}
          {t(`finished.${ride.status}`)}
        </p>
      ) : actions.length ? null : (
        <p className="rounded-2xl border bg-card p-4 text-sm">{t("waiting")}</p>
      )}

      <section aria-labelledby="customer" className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 id="customer" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("customer")}
        </h2>
        <p className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words">{ride.customerName}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="lg" className="h-12">
            <a href={tel(ride.customerPhone)} aria-label={t("callCustomer", { name: ride.customerName })}>
              <Phone /> {t("call")}
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12">
            <a
              href={whatsapp(ride.customerPhone)}
              target="_blank"
              rel="noreferrer"
              aria-label={t("whatsappCustomer", { name: ride.customerName })}
            >
              <MessageCircle /> {t("whatsapp")}
            </a>
          </Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden="true" /> {t("passengers", { count: ride.passengers })}
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
              <span className="block text-xs text-muted-foreground">{t("pickup")}</span>
              <span className="font-semibold">{ride.pickup_address}</span>
            </span>
          </p>
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={ride.pickupMap} target="_blank" rel="noreferrer">
              <Navigation /> {t("openPickupMap")}
            </a>
          </Button>
        </div>
        {ride.mode === "point_to_point" ? (
          <div className="space-y-2 border-t pt-3">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <span>
                <span className="block text-xs text-muted-foreground">{t("drop")}</span>
                <span className="font-semibold">{ride.drop_address || t("dropOnMap")}</span>
              </span>
            </p>
            {ride.dropMap ? (
              <Button asChild variant="outline" className="h-12 w-full">
                <a href={ride.dropMap} target="_blank" rel="noreferrer">
                  <Navigation /> {t("openDropMap")}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
        {ride.route ? (
          <p className="flex items-start gap-2 border-t pt-3 text-sm">
            <Route className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {ride.route}
              {ride.distance_km ? ` · ${t("km", { km: Number(ride.distance_km) })}` : null}
            </span>
          </p>
        ) : null}
        {ride.vehicle_label || ride.vehicle_registration ? (
          <p className="flex items-center gap-2 border-t pt-3 text-sm">
            <Bike className="size-4 text-primary" aria-hidden="true" />
            {[ride.vehicle_label, ride.vehicle_registration].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="cash"
        className={
          ride.balancePaise > 0
            ? "rounded-2xl border-2 border-accent-orange bg-accent-orange/10 p-4"
            : "rounded-2xl border bg-card p-4"
        }
      >
        <h2 id="cash" className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="size-5" aria-hidden="true" /> {t("cashTitle")}
        </h2>
        {ride.balancePaise > 0 ? (
          <>
            <p className="text-3xl font-extrabold">{formatPaise(ride.balancePaise, locale)}</p>
            <p className="text-sm text-muted-foreground">{t("cashHint")}</p>
          </>
        ) : (
          <p className="font-semibold">{t("nothingToCollect")}</p>
        )}
      </section>

      {/* The next step sits in a bar pinned to the bottom; only the no-show button stays down here. */}
      {!finished && actions.length ? <RideDriverPanel token={token} actions={actions} /> : null}

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
