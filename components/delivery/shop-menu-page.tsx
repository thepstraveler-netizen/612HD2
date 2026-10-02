import { ArrowLeft, BadgeCheck, Clock, ImageOff, Leaf, MapPin, Moon, Star } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getFeatureFlag } from "@/lib/bookings/settings";
import type { StoreMenu } from "@/lib/delivery/types";
import { parseMenuFilters, SHOP_CONFIG, storeOpenState, type CartShop } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { ShopTag } from "./diet-mark";
import { OrderingPaused } from "./ordering-paused";
import { OpenLabel } from "./store-card";
import { StoreMenuView } from "./store-menu";

type RawParams = Record<string, string | string[] | undefined>;

/** Store header (name, cuisines, hours, minimum) above the interactive menu. */
export async function ShopMenuPage({
  shop,
  menu,
  locale,
  raw,
}: {
  shop: CartShop;
  menu: StoreMenu;
  locale: string;
  raw: RawParams;
}) {
  const t = await getTranslations("shop");
  const config = SHOP_CONFIG[shop];
  const { store } = menu;
  const flagOn = await getFeatureFlag(config.flag);
  const open = storeOpenState(store, new Date());
  const name = pickLocalized(store.name, locale);
  const description = store.description ? pickLocalized(store.description, locale) : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-32 sm:py-8">
      <Link
        href={config.path}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t(`${shop}.back`)}
      </Link>

      <header className="grid gap-4 overflow-hidden rounded-2xl border bg-card sm:grid-cols-[14rem_1fr]">
        <div className="relative aspect-[16/9] bg-secondary sm:aspect-auto sm:min-h-44">
          {store.imageUrl ? (
            <Image
              src={store.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 14rem, 100vw"
              className="object-cover"
              priority
            />
          ) : (
            <span className="grid h-full min-h-32 place-items-center text-muted-foreground">
              <ImageOff className="size-8" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="space-y-2 p-4 sm:ps-0">
          <div className="flex flex-wrap gap-1.5">
            {store.pureVeg ? (
              <ShopTag tone="green">
                <Leaf className="size-3" aria-hidden="true" /> {t("card.pureVeg")}
              </ShopTag>
            ) : null}
            {store.is24x7 ? (
              <ShopTag tone="primary">
                <Moon className="size-3" aria-hidden="true" /> {t("card.h24")}
              </ShopTag>
            ) : null}
            {store.isFeatured ? (
              <ShopTag>
                <BadgeCheck className="size-3" aria-hidden="true" /> {t("card.featured")}
              </ShopTag>
            ) : null}
          </div>
          <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{name}</h1>
          {store.cuisines.length ? (
            <p className="text-sm text-muted-foreground">{store.cuisines.join(" · ")}</p>
          ) : null}
          {description ? <p className="text-sm">{description}</p> : null}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {store.rating !== null ? (
              <li className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Star className="size-4 fill-accent-orange text-accent-orange" aria-hidden="true" />
                <span aria-label={t("card.rating", { rating: store.rating.toFixed(1) })}>
                  {store.rating.toFixed(1)}
                </span>
              </li>
            ) : null}
            <li>
              <OpenLabel open={open} locale={locale} className="text-sm" />
            </li>
            <li className="inline-flex items-center gap-1">
              <Clock className="size-4" aria-hidden="true" /> {t("card.prep", { minutes: store.prepMinutes })}
            </li>
            {store.minOrderPaise > 0 ? (
              <li>{t("card.minOrder", { amount: formatPaise(store.minOrderPaise, locale) })}</li>
            ) : null}
            {store.address ? (
              <li className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" /> {store.address}
              </li>
            ) : null}
          </ul>
        </div>
      </header>

      {!flagOn ? <OrderingPaused shop={shop} /> : null}

      <StoreMenuView
        shop={shop}
        menu={menu}
        locale={locale}
        initialFilters={parseMenuFilters(raw)}
        canOrder={flagOn && open.state === "open"}
        orderBlock={!flagOn ? "paused" : open.state === "open" ? null : "closed"}
      />
    </div>
  );
}
