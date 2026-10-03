"use client";

import { Heart, ImageOff } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import { WISHLIST_SUBJECTS, wishlistKey, type WishlistItem } from "@/lib/wishlist/types";
import { useWishlist, WishlistButton } from "./wishlist-button";

/**
 * Saved items grouped by type. Removing an item (heart) hides it at once;
 * the server list is refreshed on the next visit.
 */
export function WishlistGrid({ items, locale }: { items: WishlistItem[]; locale: string }) {
  const t = useTranslations("wishlist");
  const wishlist = useWishlist();
  const visible =
    wishlist.status === "ready" && wishlist.signedIn
      ? items.filter((i) => wishlist.keys.has(wishlistKey(i.type, i.id)))
      : items;

  if (!visible.length) {
    return (
      <EmptyState
        icon={Heart}
        title={t("empty")}
        description={t("emptyBody")}
        action={
          <Button asChild variant="outline">
            <Link href="/hotels">{t("explore")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      {WISHLIST_SUBJECTS.map((type) => {
        const group = visible.filter((i) => i.type === type);
        if (!group.length) return null;
        return (
          <section key={type} aria-labelledby={`wishlist-${type}`} className="space-y-3">
            <h2 id={`wishlist-${type}`} className="text-lg font-bold">
              {t(`groups.${type}`)} <span className="text-muted-foreground">({group.length})</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.map((item) => (
                <li key={item.id}>
                  <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md">
                    <div className="relative aspect-[16/10] bg-secondary">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1280px) 22vw, (min-width: 640px) 40vw, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-muted-foreground">
                          <ImageOff className="size-8" aria-hidden="true" />
                        </span>
                      )}
                      <WishlistButton
                        type={item.type}
                        id={item.id}
                        name={item.name}
                        className="absolute end-2 top-2"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <h3 className="leading-snug font-bold">
                        <Link
                          href={item.href}
                          className="after:absolute after:inset-0 focus-visible:outline-none"
                        >
                          {item.name}
                        </Link>
                      </h3>
                      {item.subtitle ? (
                        <p className="line-clamp-1 text-sm text-muted-foreground">{item.subtitle}</p>
                      ) : null}
                      {item.pricePaise !== null ? (
                        <p className="mt-auto pt-2 text-sm">
                          <span className="font-bold">
                            {t("from", { price: formatPaise(item.pricePaise, locale) })}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {item.priceUnit === "night" ? t("perNight") : t("perPerson")}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
