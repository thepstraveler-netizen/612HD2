import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { mediaUrl } from "@/lib/media";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceRole } from "@/lib/env.server";
import {
  deliverySettingsSchema,
  storeHoursSchema,
  type DeliverySettings,
  type StoreKind,
} from "@/schemas/delivery";
import type { Database, Tables } from "@/types/database";
import type { DeliveryZone, MenuItem, Store, StoreMenu } from "./types";

/**
 * Public delivery catalog. Listings and menus are cached under the
 * `catalog` tag (admin and vendor saves clear it) for a minute at most, so
 * stock shown is close to live; checkout always re-reads the menu fresh.
 */

type Client = SupabaseClient<Database>;

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[delivery] ${scope}: ${error.message}`);
}

async function mediaPaths(client: Client, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const { data, error } = await client.from("media").select("id, path").in("id", wanted);
  if (error) fail("media", error);
  const out = new Map<string, string>();
  for (const m of data ?? []) {
    const url = mediaUrl(m.path);
    if (url) out.set(m.id, url);
  }
  return out;
}

export function toZone(z: Tables<"delivery_zones">): DeliveryZone {
  return {
    id: z.id,
    slug: z.slug,
    name: z.name,
    feePaise: z.fee_paise,
    freeAbovePaise: z.free_above_paise,
    etaMinutes: z.eta_minutes,
  };
}

export function toStore(s: Tables<"stores">, zoneIds: string[], imageUrl: string | null): Store {
  const hours = storeHoursSchema.safeParse(s.hours);
  return {
    id: s.id,
    vendorId: s.vendor_id,
    kind: s.kind,
    slug: s.slug,
    name: s.name,
    description: s.description,
    cuisines: s.cuisines,
    imageUrl,
    address: s.address,
    phone: s.phone,
    pureVeg: s.pure_veg,
    is24x7: s.is_24x7,
    hours: hours.success ? hours.data : [],
    acceptingOrders: s.accepting_orders,
    prepMinutes: s.prep_minutes,
    minOrderPaise: s.min_order_paise,
    packagingFeePaise: s.packaging_fee_paise,
    taxBps: s.tax_bps,
    drugLicenceNo: s.drug_licence_no,
    rating: s.rating === null ? null : Number(s.rating),
    isFeatured: s.is_featured,
    zoneIds,
  };
}

export const getDeliveryZones = unstable_cache(
  async (): Promise<DeliveryZone[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) fail("zones", error);
    return (data ?? []).map(toZone);
  },
  ["delivery:zones"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

async function loadStores(client: Client, filter: { kind?: StoreKind; id?: string; slug?: string }): Promise<Store[]> {
  let q = client.from("stores").select("*").eq("is_active", true).is("deleted_at", null);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.slug) q = q.eq("slug", filter.slug);
  const { data: stores, error } = await q.order("is_featured", { ascending: false }).order("sort_order");
  if (error) fail("stores", error);
  if (!stores?.length) return [];
  const [zonesRes, images] = await Promise.all([
    client
      .from("store_zones")
      .select("store_id, zone_id")
      .in(
        "store_id",
        stores.map((s) => s.id),
      ),
    mediaPaths(
      client,
      stores.map((s) => s.image_id),
    ),
  ]);
  if (zonesRes.error) fail("store zones", zonesRes.error);
  return stores.map((s) =>
    toStore(
      s,
      (zonesRes.data ?? []).filter((z) => z.store_id === s.id).map((z) => z.zone_id),
      s.image_id ? (images.get(s.image_id) ?? null) : null,
    ),
  );
}

export const getStores = unstable_cache(
  async (kind: StoreKind): Promise<Store[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    return loadStores(supabase, { kind });
  },
  ["delivery:stores"],
  { tags: [CATALOG_TAG], revalidate: 60 },
);

/** A store's full menu (active categories, every item with its variants and add-ons). */
export async function loadStoreMenu(
  client: Client,
  filter: { id?: string; slug?: string },
): Promise<StoreMenu | null> {
  const [store] = await loadStores(client, filter);
  if (!store) return null;
  const [cats, items] = await Promise.all([
    client.from("store_categories").select("*").eq("store_id", store.id).eq("is_active", true).order("sort_order"),
    client.from("store_items").select("*").eq("store_id", store.id).order("sort_order"),
  ]);
  if (cats.error) fail("categories", cats.error);
  if (items.error) fail("items", items.error);
  const itemIds = (items.data ?? []).map((i) => i.id);
  const [variants, groups, images] = await Promise.all([
    itemIds.length
      ? client.from("item_variants").select("*").in("item_id", itemIds).order("sort_order")
      : Promise.resolve({ data: [] as Tables<"item_variants">[], error: null }),
    itemIds.length
      ? client.from("item_addon_groups").select("*").in("item_id", itemIds).order("sort_order")
      : Promise.resolve({ data: [] as Tables<"item_addon_groups">[], error: null }),
    mediaPaths(
      client,
      (items.data ?? []).map((i) => i.image_id),
    ),
  ]);
  if (variants.error) fail("variants", variants.error);
  if (groups.error) fail("addon groups", groups.error);
  const groupIds = (groups.data ?? []).map((g) => g.id);
  const addons = groupIds.length
    ? await client.from("item_addons").select("*").in("group_id", groupIds).order("sort_order")
    : { data: [] as Tables<"item_addons">[], error: null };
  if (addons.error) fail("addons", addons.error);

  const activeCats = new Set((cats.data ?? []).map((c) => c.id));
  const menuItems: MenuItem[] = (items.data ?? [])
    // Items in a hidden category are hidden too; uncategorised items show under "More".
    .filter((i) => i.category_id === null || activeCats.has(i.category_id))
    .map((i) => ({
      id: i.id,
      categoryId: i.category_id,
      name: i.name,
      description: i.description,
      imageUrl: i.image_id ? (images.get(i.image_id) ?? null) : null,
      diet: i.diet,
      isJain: i.is_jain,
      isSattvik: i.is_sattvik,
      pricePaise: i.price_paise,
      mrpPaise: i.mrp_paise,
      taxBps: i.tax_bps,
      hsn: i.hsn,
      unit: i.unit,
      trackStock: i.track_stock,
      stock: i.stock,
      isAvailable: i.is_available,
      isBestseller: i.is_bestseller,
      variants: (variants.data ?? [])
        .filter((v) => v.item_id === i.id)
        .map((v) => ({ id: v.id, name: v.name, pricePaise: v.price_paise, stock: v.stock, isAvailable: v.is_available })),
      addonGroups: (groups.data ?? [])
        .filter((g) => g.item_id === i.id)
        .map((g) => ({
          id: g.id,
          name: g.name,
          min: g.min_select,
          max: g.max_select,
          addons: (addons.data ?? [])
            .filter((a) => a.group_id === g.id)
            .map((a) => ({ id: a.id, name: a.name, pricePaise: a.price_paise, isAvailable: a.is_available })),
        })),
    }));
  return {
    store,
    categories: (cats.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    items: menuItems,
  };
}

export const getStoreMenu = unstable_cache(
  async (slug: string): Promise<StoreMenu | null> => {
    const supabase = createPublicClient();
    if (!supabase) return null;
    return loadStoreMenu(supabase, { slug });
  },
  ["delivery:menu"],
  { tags: [CATALOG_TAG], revalidate: 60 },
);

/** Live menu for checkout (service role, uncached: stock must be current). */
export async function getLiveStoreMenu(storeId: string): Promise<StoreMenu | null> {
  if (!hasServiceRole()) return null;
  return loadStoreMenu(createAdminClient(), { id: storeId });
}

export const getDeliverySettings = unstable_cache(
  async (): Promise<DeliverySettings> => {
    const supabase = createPublicClient();
    if (!supabase) return deliverySettingsSchema.parse({});
    const { data } = await supabase.from("settings").select("value").eq("key", "delivery.defaults").maybeSingle();
    const parsed = deliverySettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : deliverySettingsSchema.parse({});
  },
  ["delivery:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
