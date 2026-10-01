import { Phone } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AdminTrip, TripLookups } from "@/lib/cabs/admin";
import { canAssign, nextTripSteps, tripTone, type VehicleChoice } from "@/lib/cabs/admin-rows";
import { ToneBadge } from "./booking-status";
import { TripActions } from "./cab-trip-actions";

type Format = Awaited<ReturnType<typeof getFormatter>>;

/** Pickup moments are shown in India time whatever the viewer's zone. */
export function indiaTime(format: Format, iso: string | null): string {
  return iso
    ? format.dateTime(new Date(iso), {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "–";
}

/** "Mathura → Delhi Airport", a tour's name, or "Vrindavan · 8 hrs · 80 km" for local hire. */
export function tripRouteText(
  trip: Pick<AdminTrip, "trip_type" | "route_id" | "package_id" | "pickup_place_id" | "drop_place_id">,
  lookups: TripLookups,
): string {
  const from = lookups.places.get(trip.pickup_place_id) ?? "";
  if (trip.trip_type === "local") {
    const pkg = trip.package_id ? lookups.packages.get(trip.package_id) : null;
    return pkg ? `${from} · ${pkg}` : from;
  }
  if (trip.trip_type === "sightseeing" && trip.route_id) {
    return lookups.routes.get(trip.route_id) ?? from;
  }
  const to = trip.drop_place_id ? lookups.places.get(trip.drop_place_id) : null;
  return to ? `${from} → ${to}` : from;
}

export type AssignOptions = {
  drivers: { value: string; label: string }[];
  /** Vehicle choices per booked category id. */
  vehiclesByCategory: Map<string, VehicleChoice[]>;
};

/** One trip on the dispatch board, with its actions for cabs.write staff. */
export async function TripCard({
  trip,
  lookups,
  options,
  now,
}: {
  trip: AdminTrip;
  lookups: TripLookups;
  /** Absent for read-only viewers. */
  options: AssignOptions | null;
  now: number;
}) {
  const [t, format] = await Promise.all([getTranslations("cabsAdmin"), getFormatter()]);
  const late =
    Date.parse(trip.pickup_at) < now && (trip.status === "unassigned" || trip.status === "assigned");
  const steps = nextTripSteps(trip.status);
  return (
    <li className="grid gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold">
            {indiaTime(format, trip.pickup_at)}
            {late ? (
              <span className="ml-2 text-sm font-medium text-destructive">{t("dispatch.late")}</span>
            ) : null}
          </p>
          <p className="text-sm">{tripRouteText(trip, lookups)}</p>
        </div>
        <ToneBadge tone={tripTone(trip.status)} label={t(`status.${trip.status}`)} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("dispatch.booking")}</dt>
        <dd className="flex flex-wrap gap-x-3">
          {trip.booking ? (
            <Link href={`/admin/bookings/${trip.booking.id}`} className="font-mono font-medium text-primary">
              {trip.booking.code}
            </Link>
          ) : (
            "–"
          )}
          <Link href={`/admin/cabs/trips/${trip.id}`} className="text-primary">
            {t("dispatch.tripDetails")}
          </Link>
        </dd>
        <dt className="text-muted-foreground">{t("dispatch.trip")}</dt>
        <dd>
          {t(`tripTypes.${trip.trip_type}`)} · {lookups.categories.get(trip.category_id) ?? "–"} ·{" "}
          {t("dispatch.passengers", { count: trip.passengers })}
        </dd>
        <dt className="text-muted-foreground">{t("dispatch.pickupAt")}</dt>
        <dd className="break-words">{trip.pickup_address}</dd>
        <dt className="text-muted-foreground">{t("dispatch.customer")}</dt>
        <dd>
          {trip.booking ? (
            <>
              {trip.booking.contact_name} ·{" "}
              <a
                href={`tel:${trip.booking.contact_phone}`}
                className="inline-flex items-center gap-1 text-primary"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {trip.booking.contact_phone}
              </a>
            </>
          ) : (
            "–"
          )}
        </dd>
        <dt className="text-muted-foreground">{t("dispatch.driver")}</dt>
        <dd>
          {trip.driver_name ? (
            <>
              {trip.driver_name}
              {trip.driver_phone ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={`tel:${trip.driver_phone}`} className="text-primary">
                    {trip.driver_phone}
                  </a>
                </>
              ) : null}
              <span className="block text-muted-foreground">
                {[trip.vehicle_label, trip.vehicle_registration].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span className="text-accent-amber">{t("dispatch.noDriver")}</span>
          )}
        </dd>
      </dl>
      {options ? (
        <TripActions
          tripId={trip.id}
          canAssign={canAssign(trip.status)}
          assigned={Boolean(trip.driver_id)}
          steps={steps}
          drivers={options.drivers}
          vehicles={options.vehiclesByCategory.get(trip.category_id) ?? []}
          current={{ driverId: trip.driver_id, vehicleId: trip.vehicle_id }}
        />
      ) : null}
    </li>
  );
}
