import type { Database } from "@/types/database";

export type WishlistSubject = Database["public"]["Enums"]["wishlist_subject"];
export const WISHLIST_SUBJECTS = ["hotel", "package", "store"] as const satisfies readonly WishlistSubject[];

/** `hotel:<uuid>`: one key per saved item. */
export function wishlistKey(type: WishlistSubject, id: string): string {
  return `${type}:${id}`;
}

/** `/login?next=…` for a signed-out visitor, returning them to `path` (already locale-prefixed). */
export function loginHrefFor(path: string): string {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `/login?next=${encodeURIComponent(safe)}`;
}

export type WishlistItem = {
  type: WishlistSubject;
  id: string;
  name: string;
  imageUrl: string | null;
  href: string;
  /** "From ₹…" price in paise; null when the catalog has none. */
  pricePaise: number | null;
  /** For packages: price is per person; hotels: per night. */
  priceUnit: "night" | "person" | null;
  subtitle: string | null;
  savedAt: string;
};
