import { z } from "zod";
import type { LocalizedJson } from "@/lib/i18n/localized";
import {
  cartLineSchema,
  type CartLine,
  type Diet,
  type OrderStatus,
  type PrescriptionStatus,
  type StoreKind,
} from "@/schemas/delivery";
import { lineKey } from "./cart";
import { isOpenAt, nextOpening } from "./hours";
import type { MenuItem, Store } from "./types";

/**
 * Pure helpers for the customer shop pages (food, essentials, medicine):
 * URL filters, the open-now label, the browser cart (one store at a time),
 * item option checks, prescription file checks and the order snapshot. No
 * price shown here is trusted: the server prices every cart again.
 */

// ---------------------------------------------------------------- shops

/** The two shops with a menu and a cart (medicine goes through a prescription instead). */
export const CART_SHOPS = ["food", "essentials"] as const;
export type CartShop = (typeof CART_SHOPS)[number];

export const SHOP_CONFIG = {
  food: { kind: "restaurant", flag: "booking.food", path: "/food" },
  essentials: { kind: "grocery", flag: "booking.essentials", path: "/essentials" },
} as const satisfies Record<CartShop, { kind: StoreKind; flag: string; path: string }>;

/** One checkout page serves both shops; the cart says which store it is for. */
export const ORDER_CHECKOUT_PATH = "/checkout/order";

// ---------------------------------------------------------------- listing filters

type RawParams = Record<string, string | string[] | undefined>;

export type ShopFilters = {
  /** Pure-veg stores only. */
  veg: boolean;
  /** Stores with at least one Jain item (the menu page then shows only those). */
  jain: boolean;
  /** Stores with at least one Sattvik item. */
  sattvik: boolean;
  /** Open round the clock. */
  h24: boolean;
  /** Open and taking orders right now. */
  open: boolean;
  /** Delivery zone slug. */
  zone: string | null;
};

export const SHOP_FLAG_KEYS = ["veg", "jain", "sattvik", "h24", "open"] as const;
export type ShopFlagKey = (typeof SHOP_FLAG_KEYS)[number];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const zoneSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);

export function parseShopFilters(raw: RawParams): ShopFilters {
  const on = (key: string) => first(raw[key]) === "1";
  const zone = zoneSlug.safeParse(first(raw.zone));
  return {
    veg: on("veg"),
    jain: on("jain"),
    sattvik: on("sattvik"),
    h24: on("h24"),
    open: on("open"),
    zone: zone.success ? zone.data : null,
  };
}

/** The URL query for a set of filters (only what is switched on). */
export function shopFilterQuery(f: ShopFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SHOP_FLAG_KEYS) if (f[key]) out[key] = "1";
  if (f.zone) out.zone = f.zone;
  return out;
}

export function toggleShopFilter(f: ShopFilters, key: ShopFlagKey): Record<string, string> {
  return shopFilterQuery({ ...f, [key]: !f[key] });
}

export function withZone(f: ShopFilters, zone: string | null): Record<string, string> {
  return shopFilterQuery({ ...f, zone });
}

export function countShopFilters(f: ShopFilters): number {
  return SHOP_FLAG_KEYS.filter((k) => f[k]).length + (f.zone ? 1 : 0);
}

/** Which special diets a store's menu offers (for the Jain / Sattvik listing filters). */
export type StoreDiets = { jain: boolean; sattvik: boolean };

export function menuDiets(
  items: readonly Pick<MenuItem, "isJain" | "isSattvik" | "isAvailable">[],
): StoreDiets {
  const live = items.filter((i) => i.isAvailable);
  return { jain: live.some((i) => i.isJain), sattvik: live.some((i) => i.isSattvik) };
}

export function filterStores<
  S extends Pick<Store, "id" | "pureVeg" | "is24x7" | "hours" | "acceptingOrders" | "zoneIds">,
>(
  stores: readonly S[],
  f: ShopFilters,
  ctx: { now: Date; zoneId: string | null; diets?: ReadonlyMap<string, StoreDiets> },
): S[] {
  return stores.filter((s) => {
    if (f.veg && !s.pureVeg) return false;
    if (f.h24 && !s.is24x7) return false;
    if (f.open && !(s.acceptingOrders && isOpenAt(s, ctx.now))) return false;
    if (f.zone && (!ctx.zoneId || !s.zoneIds.includes(ctx.zoneId))) return false;
    const diets = ctx.diets?.get(s.id);
    if (f.jain && !diets?.jain) return false;
    if (f.sattvik && !diets?.sattvik) return false;
    return true;
  });
}

// ---------------------------------------------------------------- open now

export type OpenState =
  | { state: "open" }
  | { state: "paused" }
  | { state: "opens"; time: string; today: boolean; day: number }
  | { state: "closed" };

/** Whether a store takes orders now and, if not, when it next opens (India time). */
export function storeOpenState(
  store: Pick<Store, "is24x7" | "hours" | "acceptingOrders">,
  now: Date,
): OpenState {
  if (!store.acceptingOrders) return { state: "paused" };
  if (isOpenAt(store, now)) return { state: "open" };
  const next = nextOpening(store, now);
  return next ? { state: "opens", ...next } : { state: "closed" };
}

/** ISO weekday (Mon = 1) → its name, e.g. "Tuesday" / "मंगलवार". */
export function weekdayName(day: number, locale: string): string {
  // 2024-01-01 was a Monday.
  const date = new Date(Date.UTC(2024, 0, day));
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

// ---------------------------------------------------------------- menu

export type MenuFilters = { veg: boolean; jain: boolean; sattvik: boolean };

export function parseMenuFilters(raw: RawParams): MenuFilters {
  const f = parseShopFilters(raw);
  return { veg: f.veg, jain: f.jain, sattvik: f.sattvik };
}

/** Veg keeps vegetarian and non-food items; Jain and Sattvik keep only items tagged so. */
export function filterMenuItems<I extends Pick<MenuItem, "diet" | "isJain" | "isSattvik">>(
  items: readonly I[],
  f: MenuFilters,
): I[] {
  return items.filter((i) => {
    if (f.veg && (i.diet === "non_veg" || i.diet === "egg")) return false;
    if (f.jain && !i.isJain) return false;
    if (f.sattvik && !i.isSattvik) return false;
    return true;
  });
}

/** Out of stock or switched off: the item shows but can't be added. */
export function itemSoldOut(
  item: Pick<MenuItem, "isAvailable" | "trackStock" | "stock" | "variants">,
): boolean {
  if (!item.isAvailable) return true;
  if (item.trackStock && (item.stock ?? 0) <= 0) return true;
  if (
    item.variants.length > 0 &&
    !item.variants.some((v) => v.isAvailable && (v.stock === null || v.stock > 0))
  ) {
    return true;
  }
  return false;
}

/** Items that need the options sheet (a size to pick or add-ons offered). */
export function itemHasOptions(item: Pick<MenuItem, "variants" | "addonGroups">): boolean {
  return item.variants.length > 0 || item.addonGroups.some((g) => g.addons.length > 0);
}

/** The lowest price shown on the card ("from ₹220" when there are variants). */
export function itemFromPaise(item: Pick<MenuItem, "pricePaise" | "variants">): {
  paise: number;
  from: boolean;
} {
  const live = item.variants.filter((v) => v.isAvailable);
  if (live.length === 0) return { paise: item.pricePaise, from: false };
  const prices = live.map((v) => v.pricePaise);
  const min = Math.min(...prices);
  return { paise: min, from: prices.some((p) => p !== min) };
}

export type SelectionError =
  | { error: "variant_required" }
  | { error: "addon_min"; groupId: string; min: number }
  | { error: "addon_max"; groupId: string; max: number };

/** Checks a variant / add-on choice the way the server will (required size, group min and max). */
export function checkSelection(
  item: Pick<MenuItem, "variants" | "addonGroups">,
  variantId: string | null,
  addonIds: readonly string[],
): SelectionError | null {
  if (item.variants.length > 0) {
    const v = item.variants.find((x) => x.id === variantId);
    if (!v || !v.isAvailable) return { error: "variant_required" };
  }
  const chosen = new Set(addonIds);
  for (const g of item.addonGroups) {
    const n = g.addons.filter((a) => chosen.has(a.id)).length;
    if (n < g.min) return { error: "addon_min", groupId: g.id, min: g.min };
    if (n > g.max) return { error: "addon_max", groupId: g.id, max: g.max };
  }
  return null;
}

/** Display-only unit price for a choice (the server prices it again). */
export function selectionUnitPaise(
  item: Pick<MenuItem, "pricePaise" | "variants" | "addonGroups">,
  variantId: string | null,
  addonIds: readonly string[],
): number {
  const variant = item.variants.find((v) => v.id === variantId);
  const chosen = new Set(addonIds);
  const addons = item.addonGroups.flatMap((g) => g.addons).filter((a) => chosen.has(a.id));
  return (variant?.pricePaise ?? item.pricePaise) + addons.reduce((s, a) => s + a.pricePaise, 0);
}

/** "Braj Thali (Deluxe) + Extra roti" in both languages, kept with the cart line. */
export function selectionLabel(
  item: Pick<MenuItem, "name" | "variants" | "addonGroups">,
  variantId: string | null,
  addonIds: readonly string[],
): LocalizedJson {
  const variant = item.variants.find((v) => v.id === variantId);
  const chosen = new Set(addonIds);
  const addons = item.addonGroups.flatMap((g) => g.addons).filter((a) => chosen.has(a.id));
  const label = (lang: "en" | "hi") => {
    const pick = (v: LocalizedJson) => (lang === "hi" && v.hi?.trim() ? v.hi : v.en);
    const base = pick(item.name);
    const size = variant ? ` (${pick(variant.name)})` : "";
    const extra = addons.length ? ` + ${addons.map((a) => pick(a.name)).join(", ")}` : "";
    return `${base}${size}${extra}`;
  };
  const hi = label("hi");
  const en = label("en");
  return { en, hi: hi === en ? null : hi };
}

// ---------------------------------------------------------------- cart

const localized = z.object({ en: z.string(), hi: z.string().nullish() });

export const cartStoreMetaSchema = z.object({
  storeId: z.uuid(),
  shop: z.enum(CART_SHOPS),
  slug: z.string().min(1).max(120),
  name: localized,
});
export type CartStoreMeta = z.output<typeof cartStoreMetaSchema>;

const cartItemLineSchema = cartLineSchema.extend({
  label: localized,
  /** Display-only estimate from the menu when added. */
  unitPaise: z.number().int().nonnegative(),
});
export type CartItemLine = z.output<typeof cartItemLineSchema>;

const cartStateSchema = z.object({
  store: cartStoreMetaSchema.nullable(),
  lines: z.array(cartItemLineSchema).max(99),
});
export type CartState = z.output<typeof cartStateSchema>;

export const EMPTY_CART: CartState = Object.freeze({ store: null, lines: [] }) as CartState;

export type CartAction =
  | { type: "add"; store: CartStoreMeta; line: CartItemLine }
  | { type: "setQty"; key: string; qty: number }
  | { type: "clear" }
  | { type: "load"; state: CartState };

export const MAX_LINE_QTY = 99;

/** The cart holds one store's items; adding from another store starts a new cart (ask first). */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const sameStore = state.store?.storeId === action.store.storeId;
      const lines = sameStore ? state.lines : [];
      const key = lineKey(action.line);
      const existing = lines.find((l) => lineKey(l) === key);
      const qty = Math.max(1, Math.min(MAX_LINE_QTY, action.line.qty));
      const next = existing
        ? lines.map((l) => (l === existing ? { ...l, qty: Math.min(MAX_LINE_QTY, l.qty + qty) } : l))
        : [...lines, { ...action.line, addonIds: [...action.line.addonIds].sort(), qty }];
      return { store: action.store, lines: next };
    }
    case "setQty": {
      const qty = Math.min(MAX_LINE_QTY, Math.floor(action.qty));
      const lines =
        qty <= 0
          ? state.lines.filter((l) => lineKey(l) !== action.key)
          : state.lines.map((l) => (lineKey(l) === action.key ? { ...l, qty } : l));
      return lines.length ? { store: state.store, lines } : EMPTY_CART;
    }
    case "clear":
      return EMPTY_CART;
    case "load":
      return action.state;
  }
}

/** True when adding from `storeId` would throw away items from another store. */
export function cartNeedsReplace(state: CartState, storeId: string): boolean {
  return state.store !== null && state.lines.length > 0 && state.store.storeId !== storeId;
}

export function cartCount(state: CartState): number {
  return state.lines.reduce((s, l) => s + l.qty, 0);
}

export function cartEstimatePaise(state: CartState): number {
  return state.lines.reduce((s, l) => s + l.unitPaise * l.qty, 0);
}

/** How many of one menu item (any variant) are in the cart. */
export function itemQtyInCart(state: CartState, itemId: string): number {
  return state.lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
}

/** The lines as the server takes them (no labels, no prices). */
export function cartRequestLines(state: CartState): CartLine[] {
  return state.lines.map((l) => ({
    itemId: l.itemId,
    variantId: l.variantId,
    addonIds: l.addonIds,
    qty: l.qty,
  }));
}

/** A cart read back from localStorage; anything malformed is dropped. */
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return EMPTY_CART;
  try {
    const parsed = cartStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.store || parsed.data.lines.length === 0) return EMPTY_CART;
    return parsed.data;
  } catch {
    return EMPTY_CART;
  }
}

// ---------------------------------------------------------------- prescriptions

export const PRESCRIPTION_MAX_FILES = 5;
export const PRESCRIPTION_MAX_BYTES = 5 * 1024 * 1024;
/** What the private bucket accepts. */
export const PRESCRIPTION_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** What's wrong with the chosen files, or null when they can be uploaded. */
export type FileProblem = "empty" | "too_many" | "too_big" | "bad_type" | null;

export function checkPrescriptionFiles(files: readonly { size: number; type: string }[]): FileProblem {
  if (files.length === 0) return "empty";
  if (files.length > PRESCRIPTION_MAX_FILES) return "too_many";
  if (files.some((f) => !(PRESCRIPTION_TYPES as readonly string[]).includes(f.type))) return "bad_type";
  if (files.some((f) => f.size > PRESCRIPTION_MAX_BYTES)) return "too_big";
  return null;
}

/** A storage-safe file name: lower-case letters, digits, dot and dash, at most 80 characters. */
export function safeFileName(input: string): string {
  const name = input.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 5)
      : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

/** "<user id>/<uuid>-<name>" inside the `prescriptions` bucket (the storage policy checks the folder). */
export function prescriptionPath(userId: string, id: string, name: string): string {
  return `${userId}/${id}-${safeFileName(name)}`;
}

/** The customer's prescription timeline. */
export const PRESCRIPTION_STEPS = ["submitted", "reviewing", "quoted", "ordered"] as const;

/** Index of the reached step, or -1 when rejected or expired. */
export function prescriptionStepIndex(status: PrescriptionStatus): number {
  return (PRESCRIPTION_STEPS as readonly string[]).indexOf(status);
}

export type Tone = "success" | "warning" | "danger" | "info" | "muted";

export function prescriptionTone(status: PrescriptionStatus): Tone {
  switch (status) {
    case "submitted":
    case "reviewing":
      return "info";
    case "quoted":
      return "warning";
    case "ordered":
      return "success";
    case "rejected":
    case "expired":
      return "danger";
  }
}

export function orderTone(status: OrderStatus): Tone {
  switch (status) {
    case "awaiting_payment":
      return "warning";
    case "delivered":
      return "success";
    case "cancelled":
    case "rejected":
      return "danger";
    default:
      return "info";
  }
}

// ---------------------------------------------------------------- orders

/** The order part of a booking snapshot (written by lib/delivery/service), read leniently. */
const orderSnapshotSchema = z.object({
  order: z.object({
    store: z.object({
      slug: z.string().default(""),
      name: localized,
      kind: z.enum(["restaurant", "grocery", "pharmacy"]),
      phone: z.string().nullish(),
    }),
    zone: z.object({ name: localized }).nullish(),
    etaMinutes: z.number().nullish(),
    itemCount: z.number().default(0),
    prescriptionId: z.string().nullish(),
  }),
});
export type OrderSnapshot = z.output<typeof orderSnapshotSchema>;

export function orderSnapshot(snapshot: unknown): OrderSnapshot | null {
  const parsed = orderSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

const orderAddressSchema = z.object({
  contact_name: z.string().default(""),
  phone: z.string().default(""),
  line1: z.string().default(""),
  line2: z.string().nullish(),
  landmark: z.string().nullish(),
  pincode: z.string().nullish(),
});
export type OrderAddress = z.output<typeof orderAddressSchema>;

export function orderAddress(json: unknown): OrderAddress | null {
  const parsed = orderAddressSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** One line of an address for display. */
export function addressLine(a: Pick<OrderAddress, "line1" | "line2" | "landmark" | "pincode">): string {
  return [a.line1, a.line2, a.landmark, a.pincode].filter((p) => p && p.trim()).join(", ");
}

/** Add-on names stored on an order item. */
export function orderItemAddons(json: unknown): string[] {
  const parsed = z.array(z.object({ name: z.string() })).safeParse(json);
  return parsed.success ? parsed.data.map((a) => a.name) : [];
}

/** The delivery OTP shows from the moment the store has the order until it is delivered. */
export function showDeliveryOtp(bookingStatus: string, status: OrderStatus, otp: string | null): boolean {
  return (
    Boolean(otp) &&
    bookingStatus === "confirmed" &&
    ["placed", "accepted", "preparing", "ready", "out_for_delivery"].includes(status)
  );
}

/** Keep refreshing the tracking page while the order is still moving. */
export function orderIsLive(status: OrderStatus): boolean {
  return !["delivered", "cancelled", "rejected"].includes(status);
}

export function dietOf(value: string | null): Diet | null {
  return value === "veg" || value === "egg" || value === "non_veg" ? value : null;
}

/** Price line key (booking items and previews) → message key under `shop.lines`. */
export function orderLineKey(key: string): "items" | "packaging" | "delivery" | "convenience" | "other" {
  if (key.startsWith("item:")) return "items";
  if (key === "fee:packaging") return "packaging";
  if (key === "delivery") return "delivery";
  if (key === "fee:convenience") return "convenience";
  return "other";
}

/** Price lines grouped for display: all items as one line, then each fee in order. */
export function groupOrderLines<L extends { key: string; amountPaise: number }>(
  lines: readonly L[],
): { key: ReturnType<typeof orderLineKey>; amountPaise: number; source: L | null }[] {
  const items = lines.filter((l) => orderLineKey(l.key) === "items");
  const out: { key: ReturnType<typeof orderLineKey>; amountPaise: number; source: L | null }[] = [];
  if (items.length)
    out.push({ key: "items", amountPaise: items.reduce((s, l) => s + l.amountPaise, 0), source: null });
  for (const l of lines) {
    const key = orderLineKey(l.key);
    if (key !== "items") out.push({ key, amountPaise: l.amountPaise, source: l });
  }
  return out;
}

/** Progress towards free delivery, 0–1, or null when the zone never delivers free. */
export function freeDeliveryProgress(
  freeAbovePaise: number | null,
  toFreePaise: number | null,
): number | null {
  if (freeAbovePaise === null || toFreePaise === null || freeAbovePaise <= 0) return null;
  return Math.max(0, Math.min(1, (freeAbovePaise - toFreePaise) / freeAbovePaise));
}
