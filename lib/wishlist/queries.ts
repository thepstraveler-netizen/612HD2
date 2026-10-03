import "server-only";
import { startingPrice } from "@/lib/availability/engine";
import { getStores } from "@/lib/delivery/queries";
import type { Store } from "@/lib/delivery/types";
import { SHOP_CONFIG } from "@/lib/delivery/ui";
import { getHotelCatalog } from "@/lib/hotels/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { getPackages } from "@/lib/packages/queries";
import { createClient } from "@/lib/supabase/server";
import type { WishlistItem } from "./types";

/**
 * The user's saved items with today's name, photo and starting price from
 * the public catalog. Items that are no longer published are skipped.
 */
export async function listWishlist(userId: string, locale: string): Promise<WishlistItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wishlists")
    .select("subject_type, subject_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  if (!rows.length) return [];

  const want = (type: string) => rows.some((r) => r.subject_type === type);
  const [catalog, packages, restaurants, groceries] = await Promise.all([
    want("hotel") ? getHotelCatalog() : null,
    want("package") ? getPackages() : [],
    want("store") ? getStores(SHOP_CONFIG.food.kind) : [],
    want("store") ? getStores(SHOP_CONFIG.essentials.kind) : [],
  ]);
  const hotels = new Map((catalog?.hotels ?? []).map((h) => [h.id, h]));
  const cities = new Map((catalog?.cities ?? []).map((c) => [c.id, c]));
  const pkgs = new Map(packages.map((p) => [p.id, p]));
  const stores = new Map<string, { store: Store; path: string }>([
    ...restaurants.map((s): [string, { store: Store; path: string }] => [
      s.id,
      { store: s, path: SHOP_CONFIG.food.path },
    ]),
    ...groceries.map((s): [string, { store: Store; path: string }] => [
      s.id,
      { store: s, path: SHOP_CONFIG.essentials.path },
    ]),
  ]);

  const items: WishlistItem[] = [];
  for (const r of rows) {
    if (r.subject_type === "hotel") {
      const h = hotels.get(r.subject_id);
      if (!h) continue;
      const image = h.images.find((i) => !i.roomId) ?? h.images[0];
      const city = cities.get(h.cityId);
      items.push({
        type: "hotel",
        id: h.id,
        name: pickLocalized(h.name, locale),
        imageUrl: image?.url ?? null,
        href: `/hotels/${h.slug}`,
        pricePaise: startingPrice(h.rooms, h.plans),
        priceUnit: "night",
        subtitle: city ? pickLocalized(city.name, locale) : null,
        savedAt: r.created_at,
      });
    } else if (r.subject_type === "package") {
      const p = pkgs.get(r.subject_id);
      if (!p) continue;
      items.push({
        type: "package",
        id: p.id,
        name: pickLocalized(p.title, locale),
        imageUrl: p.imageUrl,
        href: `/packages/${p.slug}`,
        pricePaise: p.fromPaise,
        priceUnit: "person",
        subtitle: p.destinations.join(" · ") || null,
        savedAt: r.created_at,
      });
    } else {
      const hit = stores.get(r.subject_id);
      if (!hit) continue;
      items.push({
        type: "store",
        id: hit.store.id,
        name: pickLocalized(hit.store.name, locale),
        imageUrl: hit.store.imageUrl,
        href: `${hit.path}/${hit.store.slug}`,
        pricePaise: null,
        priceUnit: null,
        subtitle: hit.store.cuisines.join(" · ") || null,
        savedAt: r.created_at,
      });
    }
  }
  return items;
}
