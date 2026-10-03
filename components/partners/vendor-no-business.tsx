import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The portal for an account that belongs to no business. */
export async function VendorNoBusiness() {
  const t = await getTranslations("vendorBusiness.noVendor");
  return (
    <EmptyState
      icon={Building2}
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild>
          <Link href="/partner">{t("apply")}</Link>
        </Button>
      }
    />
  );
}
