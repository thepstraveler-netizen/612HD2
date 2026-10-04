import { Phone, Search, Star, X } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { AdminTable } from "./payment-table";
import { SectionJumpNav } from "./section-jump-nav";
import {
  listBoardOrders,
  riderOptions,
  storeOptions,
  type AdminOrder,
  type RiderOption,
} from "@/lib/delivery/admin";
import {
  addressLine,
  canAssignRider,
  canReject,
  FINISHED_STATUSES,
  isOrderLate,
  itemsSummary,
  orderAgeMinutes,
  orderMoves,
  orderPayment,
  orderTone,
  ridersFor,
} from "@/lib/delivery/admin-rows";
import { BOARD_COLUMNS } from "@/lib/delivery/status";
import { formatPaise } from "@/lib/money";
import type { StoreKind } from "@/schemas/delivery";
import type { OrderBoardFilters } from "@/schemas/delivery-admin";
import { ToneBadge } from "./booking-status";
import { indiaTime } from "./cab-trip-card";
import { DeliveryOrderActions } from "./delivery-order-actions";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "Cash on delivery · ₹420 to collect", "Paid online" or "Online · unpaid". */
function paymentText(booking: AdminOrder["booking"], t: Translate, locale: string): string {
  if (!booking) return "–";
  const pay = orderPayment(booking);
  if (pay.kind === "cod") return t("board.cod", { amount: formatPaise(pay.duePaise, locale) });
  return pay.paid ? t("board.paidOnline") : t("board.onlineUnpaid");
}

async function OrderCard({
  order,
  riders,
  canWrite,
  now,
}: {
  order: AdminOrder;
  riders: RiderOption[];
  canWrite: boolean;
  now: number;
}) {
  const [t, locale] = await Promise.all([getTranslations("deliveryAdmin"), getLocale()]);
  const age = orderAgeMinutes(order, now);
  const late = isOrderLate(order.status, age, order.eta_at, now);
  const summary = itemsSummary(order.items);
  const moves = orderMoves(order.status);
  return (
    <li className="grid gap-2 rounded-2xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {order.booking ? (
              <Link href={`/admin/bookings/${order.booking.id}`} className="font-mono text-primary">
                {order.booking.code}
              </Link>
            ) : (
              "–"
            )}
          </p>
          <p className="break-words">{order.storeName}</p>
        </div>
        <span className={late ? "font-medium text-destructive" : "text-muted-foreground"}>
          {t("board.age", { minutes: age })}
        </span>
      </div>
      <p className="break-words">
        {summary.text}
        {summary.more ? (
          <span className="text-muted-foreground"> {t("board.more", { count: summary.more })}</span>
        ) : null}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t("board.deliverTo")}</dt>
        <dd className="min-w-0 break-words">
          <span className="font-medium">{order.zoneName}</span>
          {addressLine(order.address) ? ` · ${addressLine(order.address)}` : ""}
        </dd>
        <dt className="text-muted-foreground">{t("board.customer")}</dt>
        <dd>
          {order.booking ? (
            <>
              {order.booking.contact_name} ·{" "}
              <a
                href={`tel:${order.booking.contact_phone}`}
                className="inline-flex items-center gap-1 text-primary"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {order.booking.contact_phone}
              </a>
            </>
          ) : (
            "–"
          )}
        </dd>
        <dt className="text-muted-foreground">{t("board.payment")}</dt>
        <dd>
          {paymentText(order.booking, t, locale)}
          {order.booking ? (
            <span className="text-muted-foreground"> · {formatPaise(order.booking.total_paise, locale)}</span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">{t("board.rider")}</dt>
        <dd>
          {order.partner_name ? (
            order.partner_name
          ) : (
            <span className="text-accent-amber">{t("board.noRider")}</span>
          )}
        </dd>
      </dl>
      <DeliveryOrderActions
        orderId={order.id}
        code={order.booking?.code ?? ""}
        canWrite={canWrite}
        primary={moves.primary}
        others={moves.others}
        canReject={canReject(order.status)}
        canAssign={canAssignRider(order.status)}
        assigned={Boolean(order.partner_id)}
        riders={ridersFor(riders, order.vendor_id).map((r) => ({ value: r.id, label: r.label }))}
        current={{ partnerId: order.partner_id, partnerPhone: order.partner_phone }}
      />
    </li>
  );
}

/**
 * The live order board for some store kinds (restaurants + grocery, or
 * pharmacies): one column per open status, oldest first, then the orders
 * finished in the last 24 hours. The page re-renders itself while visible.
 */
export async function DeliveryBoard({
  kinds,
  basePath,
  filters,
  canWrite,
}: {
  kinds: readonly StoreKind[];
  /** The board's own path, for the filter form's "clear" link. */
  basePath: string;
  filters: OrderBoardFilters;
  canWrite: boolean;
}) {
  const locale = await getLocale();
  const [t, tUi, format, orders, riders, stores] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getTranslations("admin.ui"),
    getFormatter(),
    listBoardOrders(kinds, locale, filters.store),
    canWrite ? riderOptions() : Promise.resolve([]),
    storeOptions(kinds, locale),
  ]);
  const now = Date.now();
  const finished = orders
    .filter((o) => FINISHED_STATUSES.includes(o.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="space-y-6">
      <form
        method="get"
        role="search"
        className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
      >
        <div className="grid min-w-0 flex-1 gap-1.5 sm:min-w-56 sm:flex-none">
          <Label htmlFor="ob-store">{t("board.filterStore")}</Label>
          <NativeSelect id="ob-store" name="store" defaultValue={filters.store ?? ""}>
            <option value="">{t("board.allStores")}</option>
            {stores.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">
          <Search /> {t("board.apply")}
        </Button>
        {filters.store ? (
          <Button asChild variant="ghost">
            <Link href={basePath}>
              <X /> {t("board.clear")}
            </Link>
          </Button>
        ) : null}
      </form>

      <SectionJumpNav
        className="xl:hidden"
        label={tUi("jumpTo")}
        items={[
          ...BOARD_COLUMNS.map((status) => ({
            id: `ob-${status}`,
            label: t(`status.${status}`),
            count: orders.filter((o) => o.status === status).length,
          })),
          { id: "ob-recent", label: t("board.recent"), count: finished.length },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {BOARD_COLUMNS.map((status) => {
          const rows = orders.filter((o) => o.status === status);
          return (
            <section
              key={status}
              id={`ob-${status}`}
              aria-labelledby={`col-${status}`}
              className="scroll-mt-32 space-y-3"
            >
              <h2 id={`col-${status}`} className="flex items-center gap-2 text-base font-semibold">
                {t(`status.${status}`)}
                <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground">
                  {rows.length}
                </span>
              </h2>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("board.emptyColumn")}</p>
              ) : (
                <ul className="space-y-3">
                  {rows.map((order) => (
                    <OrderCard key={order.id} order={order} riders={riders} canWrite={canWrite} now={now} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section id="ob-recent" aria-labelledby="recent" className="scroll-mt-32 space-y-3">
        <h2 id="recent" className="text-base font-semibold">
          {t("board.recent")}
        </h2>
        {finished.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("board.recentEmpty")}</p>
        ) : (
          <AdminTable
            empty={t("board.recentEmpty")}
            statusColumn={2}
            headers={[
              t("board.order"),
              t("board.store"),
              t("board.statusCol"),
              t("board.total"),
              t("board.rider"),
              t("board.updated"),
            ]}
            rows={finished.map((o) => ({
              key: o.id,
              cells: [
                <span key="o" className="font-mono">
                  {o.booking ? (
                    <Link href={`/admin/bookings/${o.booking.id}`} className="text-primary">
                      {o.booking.code}
                    </Link>
                  ) : (
                    "–"
                  )}
                </span>,
                o.storeName,
                <ToneBadge key="s" tone={orderTone(o.status)} label={t(`status.${o.status}`)} />,
                <span key="t" className="whitespace-nowrap">
                  {o.booking ? formatPaise(o.booking.total_paise, locale) : "–"}
                </span>,
                <span key="r">
                  {o.partner_name ?? "–"}
                  {o.rating ? (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground">
                      <Star className="size-3.5 fill-current" aria-hidden="true" />
                      {o.rating}/5
                    </span>
                  ) : null}
                </span>,
                <span key="u" className="whitespace-nowrap">
                  {indiaTime(format, o.delivered_at ?? o.updated_at)}
                </span>,
              ],
            }))}
          />
        )}
      </section>
    </div>
  );
}
