import { Clock, ImageOff, Leaf, Moon, Star, Truck } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { WishlistButton } from "@/components/wishlist/wishlist-button";
import { Link } from "@/i18n/navigation";
import type { Store } from "@/lib/delivery/types";
import { weekdayName, type OpenState } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ShopTag } from "./diet-mark";

export type FeeHint = { feePaise: number; freeAbovePaise: number | null } | null;

/** "Open now" / "Opens at 07:00" / "Not taking orders" for a store. */
export function OpenLabel({
  open,
  locale,
  className,
}: {
  open: OpenState;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("shop.card");
  const text =
    open.state === "open"
      ? t("open")
      : open.state === "paused"
        ? t("paused")
        : open.state === "opens"
          ? open.today
            ? t("opensToday", { time: open.time })
            : t("opensOn", { day: weekdayName(open.day, locale), time: open.time })
          : t("closed");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        open.state === "open" ? "text-accent-green" : "text-accent-orange",
        className,
      )}
    >
      <Clock className="size-3.5" aria-hidden="true" /> {text}
    </span>
  );
}

/** One restaurant or shop in the listing. */
export function StoreCard({
  store,
  href,
  open,
  fee,
  locale,
  priority,
}: {
  store: Store;
  href: { pathname: string; query?: Record<string, string> };
  open: OpenState;
  fee: FeeHint;
  locale: string;
  priority?: boolean;
}) {
  const t = useTranslations("shop.card");
  const name = pickLocalized(store.name, locale);
  const description = store.description ? pickLocalized(store.description, locale) : "";
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/9] bg-secondary">
        {store.imageUrl ? (
          <Image
            src={store.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn("object-cover", open.state !== "open" && "grayscale-[60%]")}
            priority={priority}
          />
        ) : (
          <span className="grid h-full place-items-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
          </span>
        )}
        <WishlistButton type="store" id={store.id} name={name} className="absolute end-2 top-2" />
        <div className="absolute start-2 top-2 flex flex-wrap gap-1.5">
          {store.pureVeg ? (
            <ShopTag tone="green" className="bg-card/95">
              <Leaf className="size-3" aria-hidden="true" /> {t("pureVeg")}
            </ShopTag>
          ) : null}
          {store.is24x7 ? (
            <ShopTag tone="primary" className="bg-card/95">
              <Moon className="size-3" aria-hidden="true" /> {t("h24")}
            </ShopTag>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg leading-snug font-bold">
            <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {name}
            </Link>
          </h2>
          {store.rating !== null ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-accent-green px-1.5 py-0.5 text-xs font-bold text-white"
              aria-label={t("rating", { rating: store.rating.toFixed(1) })}
            >
              {store.rating.toFixed(1)} <Star className="size-3 fill-current" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        {store.cuisines.length ? (
          <p className="truncate text-sm text-muted-foreground">{store.cuisines.join(" · ")}</p>
        ) : description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
        <OpenLabel open={open} locale={locale} />
        <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
          <li>{t("prep", { minutes: store.prepMinutes })}</li>
          {store.minOrderPaise > 0 ? (
            <li>{t("minOrder", { amount: formatPaise(store.minOrderPaise, locale) })}</li>
          ) : null}
          {fee ? (
            <li className="inline-flex items-center gap-1">
              <Truck className="size-3.5" aria-hidden="true" />
              {fee.feePaise === 0
                ? t("freeDelivery")
                : fee.freeAbovePaise !== null
                  ? t("freeAbove", { amount: formatPaise(fee.freeAbovePaise, locale) })
                  : t("deliveryFrom", { amount: formatPaise(fee.feePaise, locale) })}
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}
