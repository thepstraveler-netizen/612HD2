import { Star } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { ToneBadge } from "@/components/admin/booking-status";
import { indiaTime } from "@/components/admin/cab-trip-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { RideActions } from "@/components/admin/ride-actions";
import { paymentText, rideRouteText } from "@/components/admin/ride-board";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { getRide, getRideAssignOptions, rideLookups } from "@/lib/rides/admin";
import { canAssignRide, nextRideSteps, rideTone, rideVehicleChoices } from "@/lib/rides/admin-rows";

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

/** One ride: where and when, who drives it, payment, rating and its status history. */
export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("rides.read", `/admin/rides/${id}`);
  const canWrite = hasPermission(session.permissions, "rides.write");
  const locale = await getLocale();
  const [t, format, detail, lookups, assign] = await Promise.all([
    getTranslations("admin.rides"),
    getFormatter(),
    getRide(id),
    rideLookups(locale),
    canWrite ? getRideAssignOptions(locale) : null,
  ]);
  if (!detail) notFound();
  const { ride, events } = detail;
  const when = (iso: string | null) => indiaTime(format, iso);
  const point = (pid: string | null) => (pid ? lookups.points.get(pid) : undefined);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={ride.booking?.code ?? t("ride.title")}
        backHref="/admin/rides"
        backLabel={t("ride.back")}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ToneBadge tone={rideTone(ride.status)} label={t(`status.${ride.status}`)} />
          <span>{lookups.types.get(ride.vehicle_type_id) ?? "–"}</span>
          <span aria-hidden="true">·</span>
          <span>{t(`modes.${ride.mode}`)}</span>
          {ride.booking ? (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/admin/bookings/${ride.booking.id}`} className="text-primary">
                {t("ride.openBooking")}
              </Link>
            </>
          ) : null}
        </div>
        <RideActions
          rideId={ride.id}
          code={ride.booking?.code ?? ""}
          canWrite={canWrite}
          canAssign={canAssignRide(ride.status)}
          assigned={Boolean(ride.driver_id)}
          steps={nextRideSteps(ride.status)}
          drivers={assign?.drivers ?? []}
          vehicles={assign ? rideVehicleChoices(ride.vehicle_type_id, assign.vehicles) : []}
          current={{ driverId: ride.driver_id, vehicleId: ride.vehicle_id, driverPhone: ride.driver_phone }}
        />
      </AdminPageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("ride.ride")}>
          <Facts
            items={[
              [t("ride.route"), rideRouteText(ride, lookups, t)],
              [t("ride.zone"), lookups.zones.get(ride.zone_id) ?? "–"],
              [t("ride.pickupAt"), when(ride.pickup_at)],
              [
                t("ride.pickupAddress"),
                [point(ride.pickup_point_id), ride.pickup_address].filter(Boolean).join(" · "),
              ],
              ...(ride.mode === "hourly"
                ? [[t("ride.hours"), t("board.hours", { count: ride.hours ?? 1 })] as [string, ReactNode]]
                : [
                    [
                      t("ride.dropAddress"),
                      [point(ride.drop_point_id), ride.drop_address].filter(Boolean).join(" · ") || "–",
                    ] as [string, ReactNode],
                  ]),
              [t("ride.passengers"), String(ride.passengers)],
              [t("ride.distance"), ride.distance_km ? `${Number(ride.distance_km)} km` : "–"],
            ]}
          />
        </Section>
        <Section title={t("ride.crew")}>
          <Facts
            items={[
              [
                t("ride.customer"),
                ride.booking ? (
                  <>
                    {ride.booking.contact_name} ·{" "}
                    <a href={`tel:${ride.booking.contact_phone}`} className="text-primary">
                      {ride.booking.contact_phone}
                    </a>
                  </>
                ) : (
                  "–"
                ),
              ],
              [t("ride.payment"), paymentText(ride.booking, t, locale)],
              ...(ride.booking
                ? [[t("ride.total"), formatPaise(ride.booking.total_paise, locale)] as [string, ReactNode]]
                : []),
              [
                t("ride.driver"),
                ride.driver_name ? (
                  <>
                    {ride.driver_name}
                    {ride.driver_phone ? (
                      <>
                        {" · "}
                        <a href={`tel:${ride.driver_phone}`} className="text-primary">
                          {ride.driver_phone}
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  "–"
                ),
              ],
              [
                t("ride.vehicle"),
                [ride.vehicle_label, ride.vehicle_registration].filter(Boolean).join(" · ") || "–",
              ],
              [t("ride.otp"), ride.pickup_otp ?? "–"],
              [t("ride.assignedAt"), when(ride.assigned_at)],
              [t("ride.startedAt"), when(ride.started_at)],
              [t("ride.pickedUpAt"), when(ride.picked_up_at)],
              [t("ride.completedAt"), when(ride.completed_at)],
            ]}
          />
        </Section>
      </div>

      {ride.rating ? (
        <Section title={t("ride.rating")}>
          <p className="flex items-center gap-1" aria-label={t("ride.ratingLabel", { rating: ride.rating })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                aria-hidden="true"
                className={
                  n <= (ride.rating ?? 0)
                    ? "size-5 fill-accent-amber text-accent-amber"
                    : "size-5 text-muted-foreground"
                }
              />
            ))}
            <span className="ml-2 text-sm text-muted-foreground">{when(ride.rated_at)}</span>
          </p>
          {ride.rating_comment ? <p className="text-sm">{ride.rating_comment}</p> : null}
        </Section>
      ) : null}

      <Section title={t("ride.timeline")}>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ride.noEvents")}</p>
        ) : (
          <ol className="relative space-y-4 border-s ps-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ToneBadge tone={rideTone(e.status)} label={t(`status.${e.status}`)} />
                  <span className="text-muted-foreground">
                    {when(e.created_at)} · {t(`ride.sources.${e.source}`)}
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
