import { Wrench } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RetryButton } from "@/components/pwa/retry-button";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StaffPreviewLink } from "./staff-preview-link";

/**
 * Shown in place of every public page while `site.maintenance_mode` is on
 * (D-099). Static and cacheable; kept out of search results with noindex.
 */
export async function MaintenancePage() {
  const [t, tb] = await Promise.all([getTranslations("security.maintenance"), getTranslations("brand")]);
  return (
    <main
      id="main"
      className="grid min-h-dvh place-items-center bg-background px-4 py-10"
      data-testid="maintenance-page"
    >
      <meta name="robots" content="noindex, nofollow" />
      <div className="w-full max-w-lg space-y-8 text-center">
        <Logo name={tb("short")} className="justify-center" />
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <Wrench className="size-7" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">{t("eyebrow")}</p>
          <h1 className="text-2xl font-bold text-heading sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("body")}</p>
          <p className="text-sm text-muted-foreground">{t("trips")}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <RetryButton label={t("retry")} />
            <Button asChild variant="outline">
              <Link href="/account">{t("account")}</Link>
            </Button>
          </div>
        </div>
        <StaffPreviewLink label={t("staff")} />
      </div>
    </main>
  );
}
