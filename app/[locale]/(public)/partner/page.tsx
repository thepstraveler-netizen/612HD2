import { LogIn, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PartnerApplyForm } from "@/components/partners/partner-apply-form";
import { PartnerPitch } from "@/components/partners/partner-pitch";
import { PartnerStatus } from "@/components/partners/partner-status";
import { SectionTitle } from "@/components/shared/section-title";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { getHomeSections } from "@/lib/catalog/queries";
import type { HomeSection } from "@/lib/catalog/types";
import { pickLocalized } from "@/lib/i18n/localized";
import { getMyApplications } from "@/lib/partners/queries";
import { getPartnersSettings } from "@/lib/partners/settings";
import { isOpenApplication } from "@/lib/partners/status";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ apply?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return { title: t("title"), description: t("lead") };
}

async function whyCollaborate(): Promise<HomeSection | undefined> {
  try {
    return (await getHomeSections()).find((s) => s.type === "why_collaborate");
  } catch (error) {
    console.error("[partner] home sections", error);
    return undefined;
  }
}

/**
 * Partner With Us. Signed out: the pitch and a sign-in button that comes
 * back here. Signed in: the latest application's status, or the
 * multi-step application form (again after a rejection, or for another
 * business with `?apply=1`).
 */
export default async function PartnerPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { apply } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("partner");
  const [session, settings, section] = await Promise.all([
    getSession(),
    getPartnersSettings(),
    whyCollaborate(),
  ]);

  const header = (
    <SectionTitle as="h1" lead={t("lead")}>
      {t("title")}
    </SectionTitle>
  );
  const pitch = <PartnerPitch section={section} businessTypes={settings.business_types} locale={locale} />;

  if (!session) {
    const next = `?next=${encodeURIComponent("/partner")}`;
    return (
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        {header}
        {pitch}
        <section
          aria-labelledby="partner-signin"
          className="space-y-4 rounded-2xl border-2 border-primary/30 bg-brand-sky/40 p-5 sm:p-6"
        >
          <h2 id="partner-signin" className="text-lg font-bold">
            {t("signIn.title")}
          </h2>
          <p className="max-w-2xl text-sm">{t("signIn.body")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`/login${next}`}>
                <LogIn aria-hidden="true" /> {t("signIn.signIn")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/signup${next}`}>
                <UserPlus aria-hidden="true" /> {t("signIn.signUp")}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const [latest] = await getMyApplications(session);
  const showForm = !latest || (apply === "1" && !isOpenApplication(latest.status));

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      {header}
      {showForm ? (
        <details className="group rounded-2xl border bg-card px-4 shadow-sm">
          <summary className="flex min-h-11 cursor-pointer items-center py-2 font-semibold">
            {t("pitch.title")}
          </summary>
          <div className="pb-4">{pitch}</div>
        </details>
      ) : null}
      {showForm ? (
        <PartnerApplyForm
          settings={{
            businessTypes: settings.business_types,
            requiredDocuments: settings.required_documents,
            maxFileMb: settings.max_file_mb,
            agreement: {
              version: settings.agreement.version,
              body: pickLocalized(settings.agreement.body, locale),
            },
          }}
          defaults={{
            contactName: session.profile?.full_name ?? "",
            email: session.profile?.email ?? session.user.email ?? "",
            phone: session.profile?.phone ?? "",
          }}
          locale={locale === "hi" ? "hi" : "en"}
        />
      ) : (
        <PartnerStatus application={latest} locale={locale} />
      )}
    </div>
  );
}
