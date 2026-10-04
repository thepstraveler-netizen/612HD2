import { History, Sparkles, Ticket } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/account/copy-button";
import { RedeemForm } from "@/components/account/redeem-form";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import {
  getLoyaltySettings,
  getPointsBalance,
  listActiveRewardCodes,
  listLedger,
} from "@/lib/loyalty/queries";
import { earnPercent, ledgerLabelKey, pointsToPaise } from "@/lib/loyalty/rules";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rewards");
  return { title: t("title"), robots: { index: false } };
}

export default async function RewardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account/rewards");
  const t = await getTranslations("rewards");
  const settings = await getLoyaltySettings();

  if (!settings.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <EmptyState icon={Sparkles} title={t("disabledTitle")} description={t("disabledBody")} />
      </div>
    );
  }

  const [balance, ledger, codes] = await Promise.all([
    getPointsBalance(session.user.id),
    listLedger(session.user.id),
    listActiveRewardCodes(session.user.id),
  ]);
  const money = (paise: number) => formatPaise(paise, locale);
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fmtDate = (iso: string) => dateFormat.format(new Date(iso));

  const how = [
    t("how.earn", { percent: earnPercent(settings.earn_bps) }),
    t("how.pointValue", { amount: money(settings.point_value_paise) }),
    settings.review_points > 0 ? t("how.review", { points: settings.review_points }) : null,
    settings.referrals_enabled && settings.referrer_points > 0
      ? t("how.referral", { points: settings.referrer_points })
      : null,
    t("how.redeem", { min: settings.min_redeem_points, days: settings.code_valid_days }),
    settings.expiry_days > 0 ? t("how.expiry", { days: settings.expiry_days }) : t("how.noExpiry"),
  ].filter((line): line is string => Boolean(line));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>

      <section
        aria-labelledby="balance"
        className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-blue p-5 text-white shadow-sm"
      >
        <h2 id="balance" className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <Sparkles className="size-4" aria-hidden="true" /> {t("balance")}
        </h2>
        <p className="mt-1 text-4xl font-extrabold">{t("points", { points: balance })}</p>
        <p className="text-sm text-white/85">
          {t("worth", { amount: money(pointsToPaise(balance, settings)) })}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="max-sm:px-4">
            <CardTitle>{t("redeemTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="max-sm:px-4">
            <RedeemForm balance={balance} settings={settings} locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="max-sm:px-4">
            <CardTitle>{t("howTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="max-sm:px-4">
            <ul className="space-y-2 text-sm">
              {how.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {settings.referrals_enabled ? (
              <Link
                href="/account/refer"
                className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
              >
                {t("referLink")}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="max-sm:px-4">
          <CardTitle>{t("codesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="max-sm:px-4">
          {codes.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {codes.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3"
                >
                  <div>
                    <p className="font-mono text-lg font-bold tracking-wider">{c.code}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("codeValue", { amount: money(c.valuePaise) })}
                      {c.endsAt ? ` · ${t("validUntil", { date: fmtDate(c.endsAt) })}` : null}
                    </p>
                  </div>
                  <CopyButton value={c.code} label={t("copy")} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Ticket} title={t("codesEmpty")} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="max-sm:px-4">
          <CardTitle>{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="max-sm:px-4">
          {ledger.length ? (
            <ul className="divide-y">
              {ledger.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{t(`kinds.${ledgerLabelKey(row.kind, row.points)}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        fmtDate(row.createdAt),
                        row.bookingCode ? t("booking", { code: row.bookingCode }) : null,
                        row.rewardCode ? t("rewardCode", { code: row.rewardCode }) : null,
                        row.note,
                        row.expiresAt && row.points > 0
                          ? t("expires", { date: fmtDate(row.expiresAt) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-bold tabular-nums",
                      row.points > 0 ? "text-accent-green" : "text-muted-foreground",
                    )}
                  >
                    {row.points > 0 ? `+${row.points}` : `−${Math.abs(row.points)}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title={t("historyEmpty")} description={t("historyEmptyBody")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
