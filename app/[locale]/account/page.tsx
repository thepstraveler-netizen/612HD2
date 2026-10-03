import { FileText, Gift, Heart, KeyRound, Luggage, MapPin, Sparkles, UserRound, Users } from "lucide-react";
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
import { getLoyaltySettings, getPointsBalance } from "@/lib/loyalty/queries";
import { pointsToPaise } from "@/lib/loyalty/rules";
import { formatPaise } from "@/lib/money";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title"), robots: { index: false } };
}

const QUICK_LINKS = [
  { href: "/account/wishlist", key: "wishlist", icon: Heart },
  { href: "/account/refer", key: "refer", icon: Gift },
  { href: "/account/travellers", key: "travellers", icon: Users },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/profile", key: "profile", icon: UserRound },
  { href: "/account/prescriptions", key: "prescriptions", icon: FileText },
  { href: "/account/update-password", key: "password", icon: KeyRound },
] as const;

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account");
  const t = await getTranslations("account");
  const [trips, loyalty, balance] = await Promise.all([
    listMyTrips(session.user.id, 3),
    getLoyaltySettings(),
    getPointsBalance(session.user.id),
  ]);
  const name = session.profile?.full_name ?? session.user.email ?? "";
  const visibleLinks = QUICK_LINKS.filter(
    (l) => l.key !== "refer" || (loyalty.enabled && loyalty.referrals_enabled),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("greeting", { name })}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>

      {loyalty.enabled ? (
        <section
          aria-labelledby="points"
          className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-brand-navy to-brand-blue p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <h2 id="points" className="flex items-center gap-2 text-sm font-semibold text-white/85">
              <Sparkles className="size-4" aria-hidden="true" /> {t("overview.pointsTitle")}
            </h2>
            <p className="text-3xl font-extrabold">{t("overview.points", { points: balance })}</p>
            <p className="text-sm text-white/85">
              {t("overview.worth", { amount: formatPaise(pointsToPaise(balance, loyalty), locale) })}
            </p>
          </div>
          <Button asChild variant="secondary" className="self-start sm:self-center">
            <Link href="/account/rewards">{t("overview.viewRewards")}</Link>
          </Button>
        </section>
      ) : null}

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
              <CardTitle>{t("overview.quickLinks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1">
                {visibleLinks.map(({ href, key, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium hover:bg-accent"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      {t(`nav.${key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {session.roles.some((r) => r !== "customer") ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
