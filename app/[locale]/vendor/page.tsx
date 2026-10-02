import { ClipboardList, Clock, Hourglass, IndianRupee, Store } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VendorStoreToggle } from "@/components/delivery/vendor-store-toggle";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isOpenAt, nextOpening } from "@/lib/delivery/hours";
import { getVendorContext, getVendorOrders } from "@/lib/delivery/vendor";
import { daySummary, hoursByDay } from "@/lib/delivery/vendor-ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";

type Props = { params: Promise<{ locale: string }> };

/** Mon = 1 … Sun = 7 as a short weekday name (1 Jan 2024 was a Monday). */
function weekday(day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, day)));
}

/**
 * Vendor home: today's numbers, and each store's status with the switch
 * that pauses new orders, its opening hours and whether it is open now.
 */
export default async function VendorHomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendorOrders");
  const ctx = await getVendorContext();
  if (!ctx || ctx.stores.length === 0) {
    return <EmptyState icon={Store} title={t("noStores.title")} description={t("noStores.body")} />;
  }
  const now = new Date();
  const orders = await getVendorOrders(ctx, now);
  const summary = daySummary(orders, now);

  const tiles = [
    { icon: ClipboardList, label: t("home.today"), value: String(summary.todayCount) },
    {
      icon: IndianRupee,
      label: t("home.revenue", { count: summary.deliveredCount }),
      value: formatPaise(summary.deliveredPaise, locale),
    },
    { icon: Hourglass, label: t("home.pending"), value: String(summary.pending), alert: summary.pending > 0 },
    { icon: Clock, label: t("home.inProgress"), value: String(summary.inProgress) },
  ];

  return (
    <div className="space-y-6">
      <section aria-labelledby="today" className="space-y-3">
        <h1 id="today" className="text-xl font-bold">
          {t("home.title")}
        </h1>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(({ icon: Icon, label, value, alert }) => (
            <div
              key={label}
              className={
                alert
                  ? "rounded-2xl border-2 border-accent-orange bg-accent-orange/10 p-3"
                  : "rounded-2xl border bg-card p-3"
              }
            >
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" /> {label}
              </dt>
              <dd className="mt-1 text-2xl font-extrabold">{value}</dd>
            </div>
          ))}
        </dl>
        <Button asChild size="lg" className="h-12 w-full sm:w-auto">
          <Link href="/vendor/orders">{t("home.openOrders")}</Link>
        </Button>
      </section>

      <section aria-labelledby="stores" className="space-y-3">
        <h2 id="stores" className="text-lg font-semibold">
          {t("store.title")}
        </h2>
        <ul className="space-y-3">
          {ctx.stores.map((store) => {
            const open = isOpenAt(store, now);
            const next = open ? null : nextOpening(store, now);
            return (
              <li key={store.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{pickLocalized(store.name, locale)}</p>
                  <span
                    className={
                      !store.isActive
                        ? "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        : open && store.acceptingOrders
                          ? "rounded-full bg-accent-green/15 px-2.5 py-0.5 text-xs font-semibold text-accent-green"
                          : "rounded-full bg-accent-orange/15 px-2.5 py-0.5 text-xs font-semibold text-accent-orange"
                    }
                  >
                    {!store.isActive
                      ? t("store.inactive")
                      : !store.acceptingOrders
                        ? t("store.pausedBadge")
                        : open
                          ? t("store.openNow")
                          : t("store.closedNow")}
                  </span>
                </div>
                {!open && next ? (
                  <p className="text-sm text-muted-foreground">
                    {next.today
                      ? t("store.opensToday", { time: next.time })
                      : t("store.opensOn", { day: weekday(next.day, locale), time: next.time })}
                  </p>
                ) : null}
                <VendorStoreToggle storeId={store.id} accepting={store.acceptingOrders} />
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">{t("store.hours")}</summary>
                  {store.is24x7 ? (
                    <p className="mt-2 text-muted-foreground">{t("store.always")}</p>
                  ) : (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      {hoursByDay(store.hours).map(({ day, slots }) => (
                        <div key={day} className="contents">
                          <dt className="text-muted-foreground">{weekday(day, locale)}</dt>
                          <dd>{slots.length ? slots.join(", ") : t("store.closedDay")}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{t("store.hoursHelp")}</p>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
