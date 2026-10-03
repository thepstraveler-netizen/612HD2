import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaChallengeForm } from "@/components/mfa/mfa-challenge-form";
import { Button } from "@/components/ui/button";
import { redirect } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guards";
import { getAssuranceLevel } from "@/lib/mfa/server";
import { verifiedTotpFactors } from "@/lib/mfa/policy";
import { safeNextPath } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mfa");
  return { title: t("challengeTitle"), robots: { index: false, follow: false } };
}

/**
 * The two-step sign-in prompt. The guards send an enrolled user here while
 * their session is aal1; a verified code upgrades it to aal2 and continues
 * to `next` (an unlocalized path, kept from the page they asked for).
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext, "/account");
  const session = await requireUser(`/mfa?next=${encodeURIComponent(next)}`, { mfa: false });
  const factor = verifiedTotpFactors(session.user.factors)[0];
  if (!factor || (await getAssuranceLevel()) === "aal2") {
    return redirect({ href: next, locale: await getLocale() });
  }
  const t = await getTranslations("mfa");
  return (
    <AuthCard
      title={t("challengeTitle")}
      lead={t("challengeLead")}
      footer={
        <form action={signOut}>
          <Button type="submit" variant="link" className="h-auto p-0">
            {t("signOut")}
          </Button>
        </form>
      }
    >
      <MfaChallengeForm factorId={factor.id} next={next} />
      <p className="text-xs text-muted-foreground">{t("lostDevice")}</p>
    </AuthCard>
  );
}
