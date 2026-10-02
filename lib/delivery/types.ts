import type { LocalizedJson } from "@/lib/i18n/localized";
import type { Diet, StoreHours, StoreKind } from "@/schemas/delivery";

/** Catalog shapes shared by the shop pages, the cart pricing and the server checkout. */

export type DeliveryZone = {
  id: string;
  slug: string;
  name: LocalizedJson;
  feePaise: number;
  /** Items (after discount) at or above this deliver free; null = never free. */
  freeAbovePaise: number | null;
  etaMinutes: number;
};

export type Store = {
  id: string;
  vendorId: string;
  kind: StoreKind;
  slug: string;
  name: LocalizedJson;
  description: LocalizedJson | null;
  cuisines: string[];
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  pureVeg: boolean;
  is24x7: boolean;
  hours: StoreHours;
  acceptingOrders: boolean;
  prepMinutes: number;
  minOrderPaise: number;
  packagingFeePaise: number;
  taxBps: number;
  drugLicenceNo: string | null;
  rating: number | null;
  isFeatured: boolean;
  zoneIds: string[];
};

export type MenuVariant = { id: string; name: LocalizedJson; pricePaise: number; stock: number | null; isAvailable: boolean };

export type MenuAddon = { id: string; name: LocalizedJson; pricePaise: number; isAvailable: boolean };

export type MenuAddonGroup = { id: string; name: LocalizedJson; min: number; max: number; addons: MenuAddon[] };

export type MenuItem = {
  id: string;
  categoryId: string | null;
  name: LocalizedJson;
  description: LocalizedJson | null;
  imageUrl: string | null;
  diet: Diet;
  isJain: boolean;
  isSattvik: boolean;
  pricePaise: number;
  mrpPaise: number | null;
  /** Null = the store's rate. */
  taxBps: number | null;
  hsn: string | null;
  unit: string | null;
  trackStock: boolean;
  stock: number | null;
  isAvailable: boolean;
  isBestseller: boolean;
  variants: MenuVariant[];
  addonGroups: MenuAddonGroup[];
};

export type MenuCategory = { id: string; name: LocalizedJson };

export type StoreMenu = { store: Store; categories: MenuCategory[]; items: MenuItem[] };
