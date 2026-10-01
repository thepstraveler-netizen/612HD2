import { Luggage } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TripCard } from "@/components/booking/trip-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { listMyTrips } from "@/lib/bookings/trips";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trips");
  return { title: t("title"), robots: { index: false } };
}

export default async function TripsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser("/account/trips");
  const t = await getTranslations("trips");
  const trips = await listMyTrips(session.user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
      {trips.length ? (
        <ul className="grid gap-4">
          {trips.map((trip) => (
            <li key={trip.code}>
              <TripCard trip={trip} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Luggage}
          title={t("empty")}
          action={
            <Button asChild>
              <Link href="/hotels">{t("findHotels")}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
