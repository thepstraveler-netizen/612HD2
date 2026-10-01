import { ClipboardList, Store, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";

export default async function VendorHomePage() {
  const t = await getTranslations("vendor");
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">{t("lead")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <EmptyState icon={Store} title={t("listings")} />
        <EmptyState icon={ClipboardList} title={t("orders")} />
        <EmptyState icon={Wallet} title={t("settlements")} />
      </div>
    </div>
  );
}
