import { Star } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { formatIndiaDateTime } from "@/lib/cabs/ui";
import { getVendorContext, getVendorRatings } from "@/lib/delivery/vendor";
import { averageRating } from "@/lib/delivery/vendor-ui";
import { pickLocalized } from "@/lib/i18n/localized";

type Props = { params: Promise<{ locale: string }> };

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={
            n <= value ? "size-4 fill-accent-orange text-accent-orange" : "size-4 text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

/** Customer ratings of delivered orders: the average and the latest comments. */
export default async function VendorRatingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendorOrders");
  const ctx = await getVendorContext();
  const ratings = ctx ? await getVendorRatings(ctx) : [];
  const average = averageRating(ratings.map((r) => r.rating));
  const showStore = (ctx?.stores.length ?? 0) > 1;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t("ratings.title")}</h1>
      {average === null ? (
        <EmptyState icon={Star} title={t("ratings.empty")} description={t("ratings.emptyHelp")} />
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
            <p className="text-4xl font-extrabold">{average.toFixed(1)}</p>
            <div>
              <Stars value={Math.round(average)} label={t("ratings.stars", { rating: average })} />
              <p className="text-sm text-muted-foreground">{t("ratings.count", { count: ratings.length })}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {ratings.map((r) => (
              <li key={r.id} className="space-y-1 rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars value={r.rating} label={t("ratings.stars", { rating: r.rating })} />
                  <span className="text-xs text-muted-foreground">
                    {formatIndiaDateTime(r.ratedAt, locale)}
                  </span>
                </div>
                {r.comment ? <p>{r.comment}</p> : null}
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{r.code}</span>
                  {showStore && r.storeName ? ` · ${pickLocalized(r.storeName, locale)}` : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
