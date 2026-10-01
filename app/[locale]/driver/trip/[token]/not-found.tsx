import { LinkIcon, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getBusinessInfo } from "@/lib/catalog/queries";

/** Unknown, expired or reassigned trip link. */
export default async function DriverTripNotFound() {
  const t = await getTranslations("driverTrip");
  const business = await getBusinessInfo();
  const phone = business.phone.replace(/[^0-9+]/g, "");
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <LinkIcon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-bold">{t("expiredTitle")}</h1>
      <p className="text-muted-foreground">{t("expiredBody")}</p>
      {phone ? (
        <Button asChild size="lg" className="h-14 w-full text-base">
          <a href={`tel:${phone}`}>
            <Phone /> {t("callOffice")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
