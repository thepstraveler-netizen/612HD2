import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExitPreviewLink } from "./staff-preview-link";

/** Strip above the header while staff preview the site during maintenance. */
export async function MaintenanceBanner() {
  const t = await getTranslations("security.maintenance");
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>{t("banner")}</span>
      <ExitPreviewLink label={t("exitPreview")} />
    </div>
  );
}
