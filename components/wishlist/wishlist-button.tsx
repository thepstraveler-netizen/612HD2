"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  loadWishlist,
  refreshWishlist,
  subscribeWishlist,
  toggleWishlist,
} from "@/lib/wishlist/store";
import { loginHrefFor, wishlistKey, type WishlistSubject } from "@/lib/wishlist/types";
import { cn } from "@/lib/utils";

export function useWishlist() {
  return useSyncExternalStore(subscribeWishlist, getWishlistSnapshot, getWishlistServerSnapshot);
}

/**
 * Heart toggle for a hotel, package or store. Optimistic; a signed-out
 * click goes to login and comes back to this page. `overlay` sits on a
 * photo, `inline` beside a heading.
 */
export function WishlistButton({
  type,
  id,
  name,
  variant = "overlay",
  className,
}: {
  type: WishlistSubject;
  id: string;
  name: string;
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const t = useTranslations("wishlist");
  const router = useRouter();
  const wishlist = useWishlist();
  const [pending, startTransition] = useTransition();
  const saved = wishlist.keys.has(wishlistKey(type, id));

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Cards wrap their title link over the whole card; keep the heart separate.
    event.preventDefault();
    event.stopPropagation();
    startTransition(async () => {
      await loadWishlist();
      // Signed in since this page loaded (login is a soft navigation)? Check once more.
      if (!getWishlistSnapshot().signedIn) await refreshWishlist();
      if (!getWishlistSnapshot().signedIn) {
        router.push(loginHrefFor(window.location.pathname + window.location.search));
        return;
      }
      const result = await toggleWishlist(type, id);
      if (result === null) toast.error(t("error"));
      else toast.success(result ? t("added", { name }) : t("removed", { name }));
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={t("toggle", { name })}
      title={saved ? t("savedHint") : t("saveHint")}
      data-wishlist={type}
      aria-busy={pending || undefined}
      className={cn(
        "relative z-10 inline-grid size-11 shrink-0 place-items-center rounded-full transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        variant === "overlay"
          ? "bg-card/95 text-foreground shadow-sm hover:bg-card"
          : "border bg-background hover:bg-accent",
        className,
      )}
    >
      <Heart
        className={cn("size-5 transition", saved ? "fill-accent-pink text-accent-pink" : "text-current")}
        aria-hidden="true"
      />
    </button>
  );
}
