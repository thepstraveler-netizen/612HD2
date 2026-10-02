import { Check, MapPin, SlidersHorizontal, Store as StoreIcon, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { TempleSkyline } from "@/components/shared/motifs";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { getDeliveryZones, getStoreMenu, getStores } from "@/lib/delivery/queries";
import type { DeliveryZone, Store } from "@/lib/delivery/types";
import {
  countShopFilters,
  filterStores,
  menuDiets,
  parseShopFilters,
  SHOP_CONFIG,
  SHOP_FLAG_KEYS,
  storeOpenState,
  toggleShopFilter,
  withZone,
  type CartShop,
  type StoreDiets,
} from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";
import { OrderingPaused } from "./ordering-paused";
import { StoreCard, type FeeHint } from "./store-card";

type RawParams = Record<string, string | string[] | undefined>;

/** Cheapest delivery among the store's zones (or the chosen zone), for the card hint. */
function feeHint(store: Store, zones: readonly DeliveryZone[], zoneId: string | null): FeeHint {
  const served = zones.filter((z) => store.zoneIds.includes(z.id) && (!zoneId || z.id === zoneId));
  if (!served.length) return null;
  const best = served.reduce((a, b) => (b.feePaise < a.feePaise ? b : a));
  return { feePaise: best.feePaise, freeAbovePaise: best.freeAbovePaise };
}

/**
 * Jain and Sattvik are item tags, not store settings: when either filter is
 * on, the (cached) menus are read to keep stores offering such dishes, and
 * the store link carries the filter so its menu opens filtered too.
 */
async function storeDiets(stores: readonly Store[]): Promise<Map<string, StoreDiets>> {
  const menus = await Promise.all(stores.map((s) => getStoreMenu(s.slug)));
  const out = new Map<string, StoreDiets>();
  for (const m of menus) if (m) out.set(m.store.id, menuDiets(m.items));
  return out;
}

/** Restaurants (/food) or shops (/essentials): filters in the URL, one card per store. */
export async function ShopListing({ shop, locale, raw }: { shop: CartShop; locale: string; raw: RawParams }) {
  const t = await getTranslations("shop");
  const config = SHOP_CONFIG[shop];
  const filters = parseShopFilters(raw);
  const [stores, zones, open] = await Promise.all([
    getStores(config.kind),
    getDeliveryZones(),
    getFeatureFlag(config.flag),
  ]);
  const now = new Date();
  const zone = filters.zone ? (zones.find((z) => z.slug === filters.zone) ?? null) : null;
  const diets = filters.jain || filters.sattvik ? await storeDiets(stores) : undefined;
  const shown = filterStores(stores, filters, { now, zoneId: zone?.id ?? null, diets });
  // Open stores first, keeping the catalog order (featured, then sort order) within each group.
  const ordered = [
    ...shown.filter((s) => storeOpenState(s, now).state === "open"),
    ...shown.filter((s) => storeOpenState(s, now).state !== "open"),
  ];
  const menuQuery: Record<string, string> = {};
  if (filters.veg) menuQuery.veg = "1";
  if (filters.jain) menuQuery.jain = "1";
  if (filters.sattvik) menuQuery.sattvik = "1";
  const active = countShopFilters(filters);
  const flagLabels = {
    veg: t("filters.veg"),
    jain: t("filters.jain"),
    sattvik: t("filters.sattvik"),
    h24: t("filters.h24"),
    open: t("filters.open"),
  } as const;
  const usedZones = zones.filter((z) => stores.some((s) => s.zoneIds.includes(z.id)));

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-sky to-background pb-14">
        <div className="mx-auto max-w-6xl space-y-4 px-4 pt-8 sm:pt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
            <StoreIcon className="size-4" aria-hidden="true" /> {t(`${shop}.eyebrow`)}
          </p>
          <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight">
            {t(`${shop}.title`)}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t(`${shop}.subtitle`)}</p>
          {!open ? <OrderingPaused shop={shop} /> : null}
        </div>
        <TempleSkyline className="absolute bottom-0 h-12 text-brand-navy/10 dark:text-white/5" />
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <nav aria-label={t("filters.title")} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {t("filters.title")}
          </p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap">
            {SHOP_FLAG_KEYS.filter(
              (k) => shop === "food" || (k !== "veg" && k !== "jain" && k !== "sattvik"),
            ).map((key) => {
              const on = filters[key];
              return (
                <li key={key} className="shrink-0">
                  <Link
                    href={{ pathname: config.path, query: toggleShopFilter(filters, key) }}
                    aria-pressed={on}
                    scroll={false}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:border-primary",
                    )}
                  >
                    {on ? <Check className="size-4" aria-hidden="true" /> : null} {flagLabels[key]}
                  </Link>
                </li>
              );
            })}
          </ul>
          {usedZones.length > 1 ? (
            <ul
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap"
              aria-label={t("filters.zone")}
            >
              <li className="shrink-0">
                <Link
                  href={{ pathname: config.path, query: withZone(filters, null) }}
                  aria-current={!filters.zone ? "true" : undefined}
                  scroll={false}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm",
                    !filters.zone ? "border-primary font-semibold text-primary" : "bg-card",
                  )}
                >
                  <MapPin className="size-4" aria-hidden="true" /> {t("filters.allZones")}
                </Link>
              </li>
              {usedZones.map((z) => (
                <li key={z.id} className="shrink-0">
                  <Link
                    href={{ pathname: config.path, query: withZone(filters, z.slug) }}
                    aria-current={filters.zone === z.slug ? "true" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                      filters.zone === z.slug ? "border-primary font-semibold text-primary" : "bg-card",
                    )}
                  >
                    {pickLocalized(z.name, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {filters.jain || filters.sattvik ? (
            <p className="text-xs text-muted-foreground">{t("filters.dietHint")}</p>
          ) : null}
        </nav>

        <section aria-labelledby="shop-results" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="shop-results" className="text-xl font-bold text-heading">
              {t(`${shop}.heading`)}
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t(`${shop}.count`, { count: ordered.length })}
            </p>
          </div>
          {ordered.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((store, i) => (
                <li key={store.id}>
                  <StoreCard
                    store={store}
                    href={{ pathname: `${config.path}/${store.slug}`, query: menuQuery }}
                    open={storeOpenState(store, now)}
                    fee={feeHint(store, zones, zone?.id ?? null)}
                    locale={locale}
                    priority={i < 2}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={StoreIcon}
              title={active ? t("filters.noneTitle") : t(`${shop}.emptyTitle`)}
              description={active ? t("filters.noneBody") : t(`${shop}.emptyBody`)}
              action={
                active ? (
                  <Button asChild variant="outline">
                    <Link href={config.path}>
                      <X /> {t("filters.clear")}
                    </Link>
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
