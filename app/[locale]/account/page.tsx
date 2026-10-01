import { KeyRound, Luggage } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TripCard } from "@/components/booking/trip-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { listMyTrips } from "@/lib/bookings/trips";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account");
  const t = await getTranslations("account");
  const trips = await listMyTrips(session.user.id, 3);
  const name = session.profile?.full_name ?? session.user.email ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("greeting", { name })}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("trips")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trips.length ? (
              <>
                <ul className="grid gap-3">
                  {trips.map((trip) => (
                    <li key={trip.code}>
                      <TripCard trip={trip} locale={locale} />
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/account/trips">{t("allTrips")}</Link>
                </Button>
              </>
            ) : (
              <EmptyState icon={Luggage} title={t("tripsEmpty")} />
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("roles")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {session.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABELS[role as RoleKey] ?? role}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("security")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/account/update-password">
                  <KeyRound /> {t("changePassword")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
