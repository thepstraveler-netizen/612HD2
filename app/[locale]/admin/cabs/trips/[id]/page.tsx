import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { ToneBadge } from "@/components/admin/booking-status";
import { indiaTime, tripRouteText } from "@/components/admin/cab-trip-card";
import { TripActions } from "@/components/admin/cab-trip-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getAssignOptions, getTrip, listCategories, tripLookups } from "@/lib/cabs/admin";
import { canAssign, nextTripSteps, stopsInput, tripTone, vehicleChoices } from "@/lib/cabs/admin-rows";
import { hasPermission } from "@/lib/permissions/check";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One trip: the ride, who drives it, and its status history. */
export default async function CabTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("cabs.read", `/admin/cabs/trips/${id}`);
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const locale = await getLocale();
  const [t, format, detail, lookups, categories, assign] = await Promise.all([
    getTranslations("cabsAdmin"),
    getFormatter(),
    getTrip(id),
    tripLookups(locale),
    listCategories(),
    canWrite ? getAssignOptions() : null,
  ]);
  if (!detail) notFound();
  const { trip, events } = detail;
  const when = (iso: string | null) => indiaTime(format, iso);
  const stops = stopsInput(trip.stops).map((s) => s.name);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={trip.booking?.code ?? t("trip.title")}
        backHref="/admin/cabs/trips"
        backLabel={t("trip.backToList")}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ToneBadge tone={tripTone(trip.status)} label={t(`status.${trip.status}`)} />
          <span>{t(`tripTypes.${trip.trip_type}`)}</span>
          {trip.booking ? (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/admin/bookings/${trip.booking.id}`} className="text-primary">
                {t("trip.openBooking")}
              </Link>
            </>
          ) : null}
        </div>
        {assign ? (
          <TripActions
            tripId={trip.id}
            canAssign={canAssign(trip.status)}
            assigned={Boolean(trip.driver_id)}
            steps={nextTripSteps(trip.status)}
            drivers={assign.drivers.map((d) => ({ value: d.id, label: `${d.full_name} · ${d.phone}` }))}
            vehicles={vehicleChoices(trip.category_id, categories, assign.vehicles)}
            current={{ driverId: trip.driver_id, vehicleId: trip.vehicle_id }}
          />
        ) : null}
      </AdminPageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("trip.ride")}>
          <Facts
            items={[
              [t("trip.route"), tripRouteText(trip, lookups) || "–"],
              [t("trip.category"), lookups.categories.get(trip.category_id) ?? "–"],
              [t("trip.pickupAt"), when(trip.pickup_at)],
              ...(trip.return_at ? [[t("trip.returnAt"), when(trip.return_at)] as [string, ReactNode]] : []),
              [t("trip.pickupAddress"), trip.pickup_address],
              [t("trip.dropAddress"), trip.drop_address || "–"],
              ...(stops.length ? [[t("trip.stops"), stops.join(" → ")] as [string, ReactNode]] : []),
              [t("trip.passengers"), String(trip.passengers)],
              [t("trip.distance"), trip.distance_km ? `${Number(trip.distance_km)} km` : "–"],
            ]}
          />
        </Section>
        <Section title={t("trip.crew")}>
          <Facts
            items={[
              [
                t("trip.customer"),
                trip.booking ? `${trip.booking.contact_name} · ${trip.booking.contact_phone}` : "–",
              ],
              [t("trip.driver"), trip.driver_name ? `${trip.driver_name} · ${trip.driver_phone ?? ""}` : "–"],
              [
                t("trip.vehicle"),
                [trip.vehicle_label, trip.vehicle_registration].filter(Boolean).join(" · ") || "–",
              ],
              [t("trip.otp"), trip.pickup_otp ?? "–"],
              [t("trip.assignedAt"), when(trip.assigned_at)],
              [t("trip.startedAt"), when(trip.started_at)],
              [t("trip.pickedUpAt"), when(trip.picked_up_at)],
              [t("trip.completedAt"), when(trip.completed_at)],
            ]}
          />
        </Section>
      </div>

      <Section title={t("trip.timeline")}>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("trip.noEvents")}</p>
        ) : (
          <ol className="relative space-y-4 border-s ps-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ToneBadge tone={tripTone(e.status)} label={t(`status.${e.status}`)} />
                  <span className="text-muted-foreground">
                    {when(e.created_at)} · {t(`trip.sources.${e.source}`)}
                  </span>
                </div>
                {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
