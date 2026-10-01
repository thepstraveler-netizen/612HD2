import { Route } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";

export default async function DriverHomePage() {
  const t = await getTranslations("driver");
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">{t("lead")}</p>
      <EmptyState icon={Route} title={t("empty")} />
    </div>
  );
}
