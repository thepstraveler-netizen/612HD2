import { Banknote, CheckCircle2, MapPin, Navigation, Package, Phone, Store, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RiderPanel } from "@/components/delivery/rider-panel";
import { Button } from "@/components/ui/button";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { riderActions } from "@/lib/delivery/vendor-ui";
import { getRiderOrder } from "@/lib/delivery/rider";
import { hasServiceRole } from "@/lib/env.server";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";

type Props = { params: Promise<{ locale: string; token: string }> };

const tel = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/**
 * The rider's order page, opened from the secret link sent at assignment.
 * The token is the only credential; an unknown or expired one shows the
 * "call the office" page with a 404.
 */
export default async function RiderOrderPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const order = hasServiceRole() && /^[0-9a-f]{48}$/.test(token) ? await getRiderOrder(token) : null;
  if (!order) notFound();
  const t = await getTranslations("rider");
  const business = await getBusinessInfo();
  const actions = riderActions(order.status, order.requireOtp);
  const finished =
    order.status === "delivered" || order.status === "cancelled" || order.status === "rejected";
  const storeName = pickLocalized(order.store.name, locale);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("order", { code: order.code })}</p>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">
          {t(`status.${order.status}`)}
        </span>
      </div>

      <section
        aria-labelledby="cash"
        className={
          order.collectPaise > 0
            ? "rounded-2xl border-2 border-accent-orange bg-accent-orange/10 p-4"
            : "rounded-2xl border bg-card p-4"
        }
      >
        <h2 id="cash" className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="size-5" aria-hidden="true" /> {t("cashTitle")}
        </h2>
        {order.collectPaise > 0 ? (
          <>
            <p className="text-4xl font-extrabold">{formatPaise(order.collectPaise, locale)}</p>
            <p className="text-sm text-muted-foreground">{t("cashHint")}</p>
          </>
        ) : (
          <p className="text-lg font-semibold">{t("paidOnline")}</p>
        )}
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Package className="size-4" aria-hidden="true" /> {t("items", { count: order.itemCount })}
        </p>
      </section>

      {finished ? (
        <p className="flex items-center gap-2 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4 font-semibold">
          <CheckCircle2 className="size-5 text-accent-green" aria-hidden="true" />{" "}
          {t(`finished.${order.status}`)}
        </p>
      ) : actions.length ? (
        <RiderPanel token={token} actions={actions} />
      ) : (
        <p className="rounded-2xl border bg-card p-4 text-sm">{t("waiting")}</p>
      )}

      <section aria-labelledby="pickup" className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 id="pickup" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("pickup")}
        </h2>
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-start gap-2">
            <Store className="mt-0.5 size-5 shrink-0 text-accent-green" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-lg font-bold">{storeName}</span>
              {order.store.address ? (
                <span className="block text-sm text-muted-foreground">{order.store.address}</span>
              ) : null}
            </span>
          </p>
          {order.store.phone ? (
            <Button asChild size="lg" variant="outline" className="h-12 shrink-0">
              <a href={tel(order.store.phone)} aria-label={t("callStore", { name: storeName })}>
                <Phone /> {t("call")}
              </a>
            </Button>
          ) : null}
        </div>
        {order.store.map ? (
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={order.store.map} target="_blank" rel="noreferrer">
              <Navigation /> {t("openStoreMap")}
            </a>
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="drop" className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 id="drop" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("drop")}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-lg font-bold">
            <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{order.customer.name}</span>
          </p>
          <Button asChild size="lg" className="h-12 shrink-0">
            <a href={tel(order.customer.phone)} aria-label={t("callCustomer", { name: order.customer.name })}>
              <Phone /> {t("call")}
            </a>
          </Button>
        </div>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            <span className="font-semibold">{order.customer.address}</span>
            {order.customer.landmark ? (
              <span className="block text-sm text-muted-foreground">
                {t("landmark", { landmark: order.customer.landmark })}
              </span>
            ) : null}
          </span>
        </p>
        {order.customer.map ? (
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={order.customer.map} target="_blank" rel="noreferrer">
              <Navigation /> {t("openDropMap")}
            </a>
          </Button>
        ) : null}
      </section>

      {business.phone ? (
        <Button asChild variant="ghost" className="w-full">
          <a href={tel(business.phone)}>
            <Phone /> {t("callOffice")}
          </a>
        </Button>
      ) : null}
    </>
  );
}
