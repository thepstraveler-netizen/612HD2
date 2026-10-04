import { ClipboardList } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VendorOrderCard } from "@/components/delivery/vendor-order-card";
import { RideAutoRefresh } from "@/components/admin/ride-auto-refresh";
import { EmptyState } from "@/components/shared/empty-state";
import { getDeliverySettings } from "@/lib/delivery/queries";
import { BOARD_COLUMNS } from "@/lib/delivery/status";
import { getAssignableRiders, getVendorContext, getVendorOrders } from "@/lib/delivery/vendor";
import { groupByStatus, minutesSince, vendorActions } from "@/lib/delivery/vendor-ui";

type Props = { params: Promise<{ locale: string }> };

/**
 * The store's live orders, grouped by stage (new first), with today's
 * finished ones below. Re-renders itself every 15 seconds while the tab is
 * visible so new orders show up without a reload.
 */
export default async function VendorOrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendorOrders");
  const ctx = await getVendorContext();
  if (!ctx || ctx.stores.length === 0) {
    return <EmptyState icon={ClipboardList} title={t("noStores.title")} description={t("noStores.body")} />;
  }
  const now = new Date();
  const [orders, riders, settings] = await Promise.all([
    getVendorOrders(ctx, now),
    getAssignableRiders(ctx),
    getDeliverySettings(),
  ]);
  const groups = groupByStatus(orders);
  const finished = orders.filter((o) => !(BOARD_COLUMNS as readonly string[]).includes(o.status));
  const live = BOARD_COLUMNS.reduce((n, c) => n + groups[c].length, 0);
  const showStore = ctx.stores.length > 1;
  const nowMs = now.getTime();

  return (
    <div className="space-y-6">
      <RideAutoRefresh seconds={15} />
      <div>
        <h1 className="text-xl font-bold">{t("orders.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("orders.lead")}</p>
      </div>

      {live === 0 ? (
        <EmptyState icon={ClipboardList} title={t("orders.empty")} description={t("orders.emptyHelp")} />
      ) : (
        <nav aria-label={t("orders.jump")} className="flex flex-wrap gap-2">
          {BOARD_COLUMNS.filter((c) => groups[c].length).map((c) => (
            <a
              key={c}
              href={`#col-${c}`}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {t(`status.${c}`)}
              <span className="rounded-full bg-muted px-1.5 text-xs">{groups[c].length}</span>
            </a>
          ))}
        </nav>
      )}

      {BOARD_COLUMNS.filter((c) => groups[c].length).map((column) => (
        <section
          key={column}
          id={`col-${column}`}
          aria-labelledby={`h-${column}`}
          className="scroll-mt-20 space-y-3"
        >
          <h2 id={`h-${column}`} className="flex items-center gap-2 text-base font-semibold">
            {t(`status.${column}`)}
            <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground">
              {groups[column].length}
            </span>
          </h2>
          <ul className="space-y-3">
            {groups[column].map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                actions={vendorActions(order.status, {
                  selfDelivery: order.selfDelivery,
                  requireOtp: settings.require_delivery_otp,
                })}
                riders={riders}
                minutes={minutesSince(order.placedAt ?? order.createdAt, nowMs)}
                showStore={showStore}
              />
            ))}
          </ul>
        </section>
      ))}

      {finished.length ? (
        <section aria-labelledby="h-finished" className="space-y-3">
          <h2 id="h-finished" className="flex items-center gap-2 text-base font-semibold">
            {t("orders.finishedToday")}
            <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground">
              {finished.length}
            </span>
          </h2>
          <ul className="space-y-3">
            {finished.map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                actions={[]}
                riders={[]}
                minutes={minutesSince(order.placedAt ?? order.createdAt, nowMs)}
                showStore={showStore}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
