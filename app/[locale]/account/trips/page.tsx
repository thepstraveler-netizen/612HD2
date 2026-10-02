import { Luggage } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TripCard } from "@/components/booking/trip-card";
import { RideTripCard } from "@/components/rides/ride-trip-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { listMyTrips, type TripSummary } from "@/lib/bookings/trips";
import { cabSnapshot, type TripStatus } from "@/lib/cabs/ui";
import { rideSnapshot, type RideStatus } from "@/lib/rides/ui";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trips");
  return { title: t("title"), robots: { index: false } };
}

/** Where each cab booking's trip stands, by booking code (read through RLS). */
async function cabTripStatuses(trips: TripSummary[]): Promise<Map<string, TripStatus>> {
  const codes = trips.filter((t) => cabSnapshot(t.snapshot)).map((t) => t.code);
  if (!codes.length) return new Map();
  const supabase = await createClient();
  const { data: bookings } = await supabase.from("bookings").select("id, code").in("code", codes);
  const codeOf = new Map((bookings ?? []).map((b) => [b.id, b.code]));
  if (!codeOf.size) return new Map();
  const { data: rows } = await supabase
    .from("trips")
    .select("booking_id, status")
    .in("booking_id", [...codeOf.keys()]);
  const out = new Map<string, TripStatus>();
  for (const row of rows ?? []) {
    const code = codeOf.get(row.booking_id);
    if (code) out.set(code, row.status);
  }
  return out;
}

/** Where each ride booking stands, by booking code (read through RLS, explicit columns). */
async function rideStatuses(trips: TripSummary[]): Promise<Map<string, RideStatus>> {
  const codes = trips.filter((t) => rideSnapshot(t.snapshot)).map((t) => t.code);
  if (!codes.length) return new Map();
  const supabase = await createClient();
  const { data: bookings } = await supabase.from("bookings").select("id, code").in("code", codes);
  const codeOf = new Map((bookings ?? []).map((b) => [b.id, b.code]));
  if (!codeOf.size) return new Map();
  const { data: rows } = await supabase
    .from("ride_requests")
    .select("booking_id, status")
    .in("booking_id", [...codeOf.keys()]);
  const out = new Map<string, RideStatus>();
  for (const row of rows ?? []) {
    const code = codeOf.get(row.booking_id);
    if (code) out.set(code, row.status);
  }
  return out;
}

export default async function TripsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser("/account/trips");
  const t = await getTranslations("trips");
  const trips = await listMyTrips(session.user.id);
  const [tripStatuses, rides] = await Promise.all([cabTripStatuses(trips), rideStatuses(trips)]);

  return (
    <div className="space-y-6">
      <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
      {trips.length ? (
        <ul className="grid gap-4">
          {trips.map((trip) => {
            const ride = rideSnapshot(trip.snapshot);
            return (
              <li key={trip.code}>
                {ride ? (
                  <RideTripCard
                    code={trip.code}
                    status={trip.status}
                    totalPaise={trip.total_paise}
                    ride={ride.ride}
                    rideStatus={rides.get(trip.code)}
                    locale={locale}
                  />
                ) : (
                  <TripCard trip={trip} locale={locale} tripStatus={tripStatuses.get(trip.code)} />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Luggage}
          title={t("empty")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/hotels">{t("findHotels")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cabs">{t("findCabs")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/rides">{t("findRides")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/packages">{t("findPackages")}</Link>
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
