import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SavedTrips } from "@/components/pwa/saved-trips";
import { RetryButton } from "@/components/pwa/retry-button";
import { Button } from "@/components/ui/button";

/** Static so the service worker can precache it; no header (it needs no data). */
export const dynamic = "force-static";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pwa.offline" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Shown by public/sw.js when a navigation fails offline. */
export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pwa.offline");
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <WifiOff className="size-8" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-heading">{t("title")}</h1>
          <p className="text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <RetryButton label={t("retry")} />
          <Button asChild variant="outline">
            {/* A plain link: the client router may not be usable offline. */}
            <a href={locale === "hi" ? "/hi" : "/"}>{t("home")}</a>
          </Button>
        </div>
        <SavedTrips
          title={t("savedTitle")}
          lead={t("savedLead")}
          itemLabel={t("savedTrip", { code: "{code}" })}
        />
      </div>
    </main>
  );
}
