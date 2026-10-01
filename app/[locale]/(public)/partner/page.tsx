import { Handshake } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return { title: t("title"), description: t("lead") };
}

/** Partner onboarding (multi-step form) ships in phase 9. */
export default async function PartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("partner");
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <SectionTitle as="h1" lead={t("lead")}>
        {t("title")}
      </SectionTitle>
      <EmptyState icon={Handshake} title={t("comingSoon")} />
    </div>
  );
}
