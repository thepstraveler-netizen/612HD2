"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { reportClientError } from "@/lib/observability/client";

/**
 * Error boundary for every localized page. Server errors arrive here with
 * only a digest (the full error was already reported by instrumentation.ts);
 * client render errors are reported from here.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    reportClientError(error, { tags: { handler: "error-boundary", digest: error.digest } });
  }, [error]);

  return (
    <main className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>{t("retry")}</Button>
          <Button asChild variant="outline">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">{t("reference", { digest: error.digest })}</p>
        ) : null}
      </div>
    </main>
  );
}
