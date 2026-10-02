import { Bike, Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { getOwnRiders, getVendorContext } from "@/lib/delivery/vendor";

type Props = { params: Promise<{ locale: string }> };

/** The store's own delivery riders (added by the office); read only. */
export default async function VendorRidersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendorOrders");
  const ctx = await getVendorContext();
  const riders = ctx ? await getOwnRiders(ctx) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("riders.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("riders.lead")}</p>
      </div>
      {riders.length === 0 ? (
        <EmptyState icon={Bike} title={t("riders.empty")} description={t("riders.emptyHelp")} />
      ) : (
        <ul className="space-y-3">
          {riders.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[r.vehicle, r.isActive ? t("riders.active") : t("riders.inactive")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {r.phone ? (
                <a
                  href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium"
                >
                  <Phone className="size-4" aria-hidden="true" /> {r.phone}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
