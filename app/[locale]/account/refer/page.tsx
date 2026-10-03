import { Gift, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReferralShare } from "@/components/account/referral-share";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { publicEnv } from "@/lib/env";
import { getLoyaltySettings } from "@/lib/loyalty/queries";
import { buildReferralLink } from "@/lib/referrals/link";
import { getReferralCode, listReferredFriends } from "@/lib/referrals/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("referrals");
  return { title: t("title"), robots: { index: false } };
}

export default async function ReferPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account/refer");
  const t = await getTranslations("referrals");
  const settings = await getLoyaltySettings();

  if (!settings.enabled || !settings.referrals_enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <EmptyState icon={Gift} title={t("disabledTitle")} description={t("disabledBody")} />
      </div>
    );
  }

  const [code, friends] = await Promise.all([
    getReferralCode(session.user.id),
    listReferredFriends(session.user.id),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("how", { referrer: settings.referrer_points, referee: settings.referee_points })}
        </p>
      </div>

      <Card>
        <CardContent>
          {code ? (
            <ReferralShare
              code={code}
              link={buildReferralLink(publicEnv().NEXT_PUBLIC_SITE_URL, locale, code)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("friendsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {friends.length ? (
            <ul className="divide-y">
              {friends.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{f.name ?? t("friend")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("joined", { date: dateFormat.format(new Date(f.createdAt)) })}
                    </p>
                  </div>
                  <Badge variant={f.status === "rewarded" ? "default" : "secondary"}>
                    {t(`status.${f.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title={t("friendsEmpty")} description={t("friendsEmptyBody")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
