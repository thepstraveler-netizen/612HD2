import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TravellerManager, type SavedTraveller } from "@/components/account/traveller-manager";
import { requireUser } from "@/lib/auth/guards";
import { listTravellers } from "@/lib/account/travellers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("travellers");
  return { title: t("title"), robots: { index: false } };
}

export default async function TravellersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account/travellers");
  const t = await getTranslations("travellers");
  const travellers: SavedTraveller[] = await listTravellers(session.user.id);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <TravellerManager travellers={travellers} locale={locale} />
    </div>
  );
}
