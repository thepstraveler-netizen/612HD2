import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Diet, OrderStatus, StoreKind } from "@/schemas/delivery";
import type { LocalizedJson, Tables } from "@/types/database";
import { toStore } from "./queries";
import type { Store } from "./types";
import { BOARD_COLUMNS } from "./status";
import {
  addonNames,
  deliversItself,
  indiaDayStart,
  orderAddress,
  orderCash,
  type OrderAddress,
} from "./vendor-ui";

/**
 * Vendor dashboard reads. Everything goes through the signed-in user's own
 * Supabase client, so RLS scopes it to the vendors they belong to
 * (vendor_members): orders via can_read_order, bookings via
 * can_read_booking, their own riders, and the public catalog. Order
 * columns are always listed explicitly: the rider token column is not
 * granted to signed-in users and must never reach the browser.
 */

export type VendorStore = Store & { isActive: boolean };

export type VendorContext = {
  userId: string;
  vendors: { id: string; name: string }[];
  vendorIds: string[];
  stores: VendorStore[];
};

/** Columns of `orders` the dashboard reads (never partner_token or delivery_otp). */
const ORDER_COLUMNS =
  "id, booking_id, store_id, vendor_id, kind, address, status, partner_id, partner_name, partner_phone, eta_at, placed_at, accepted_at, ready_at, picked_up_at, delivered_at, rating, rating_comment, rated_at, created_at, updated_at";

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[vendor] ${scope}: ${error.message}`);
}

/** The signed-in user's vendors and their stores (null when signed out). */
export const getVendorContext = cache(async (): Promise<VendorContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("vendor_members")
    .select("vendor_id")
    .eq("user_id", session.user.id);
  if (error) fail("members", error);
  const vendorIds = (members ?? []).map((m) => m.vendor_id);
  if (vendorIds.length === 0) return { userId: session.user.id, vendors: [], vendorIds, stores: [] };
  const [vendors, stores] = await Promise.all([
    supabase.from("vendors").select("id, name").in("id", vendorIds).is("deleted_at", null).order("name"),
    supabase
      .from("stores")
      .select("*")
      .in("vendor_id", vendorIds)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (vendors.error) fail("vendors", vendors.error);
  if (stores.error) fail("stores", stores.error);
  return {
    userId: session.user.id,
    vendors: vendors.data ?? [],
    vendorIds,
    stores: (stores.data ?? []).map((s) => ({ ...toStore(s, [], null), isActive: s.is_active })),
  };
});

export type VendorOrderItem = {
  id: string;
  name: string;
  variantName: string | null;
  addons: string[];
  diet: Diet | null;
  quantity: number;
  lineTotalPaise: number;
};

export type VendorOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  kind: StoreKind;
  storeId: string;
  storeName: LocalizedJson | null;
  placedAt: string | null;
  createdAt: string;
  etaAt: string | null;
  deliveredAt: string | null;
  customerName: string;
  customerPhone: string;
  address: OrderAddress;
  notes: string | null;
  items: VendorOrderItem[];
  itemCount: number;
  totalPaise: number;
  /** Cash on delivery: what to collect at the door. */
  cod: boolean;
  collectPaise: number;
  paidOnlinePaise: number;
  partner: { id: string; name: string; phone: string | null } | null;
  /** No rider, or one of the store's own: the store moves it out and delivers. */
  selfDelivery: boolean;
};

type OrderRow = Pick<
  Tables<"orders">,
  | "id"
  | "booking_id"
  | "store_id"
  | "vendor_id"
  | "kind"
  | "address"
  | "status"
  | "partner_id"
  | "partner_name"
  | "partner_phone"
  | "eta_at"
  | "placed_at"
  | "delivered_at"
  | "created_at"
>;

const DIET_VALUES: readonly string[] = ["veg", "egg", "non_veg", "na"];

async function hydrate(ctx: VendorContext, rows: OrderRow[]): Promise<VendorOrder[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const [items, bookings, riders] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, order_id, name, variant_name, addons, diet, quantity, line_total_paise, sort_order")
      .in(
        "order_id",
        rows.map((r) => r.id),
      )
      .order("sort_order"),
    supabase
      .from("bookings")
      .select(
        "id, code, contact_name, contact_phone, special_requests, total_paise, paid_paise, refunded_paise, payment_mode",
      )
      .in(
        "id",
        rows.map((r) => r.booking_id),
      ),
    supabase.from("delivery_partners").select("id").in("vendor_id", ctx.vendorIds),
  ]);
  if (items.error) fail("order items", items.error);
  if (bookings.error) fail("bookings", bookings.error);
  if (riders.error) fail("riders", riders.error);
  const ownRiders = new Set((riders.data ?? []).map((r) => r.id));
  const byBooking = new Map((bookings.data ?? []).map((b) => [b.id, b]));
  const storeNames = new Map(ctx.stores.map((s) => [s.id, s.name]));

  return rows.flatMap((o) => {
    const b = byBooking.get(o.booking_id);
    if (!b) return [];
    const lines = (items.data ?? [])
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        variantName: i.variant_name,
        addons: addonNames(i.addons),
        diet: i.diet && DIET_VALUES.includes(i.diet) ? (i.diet as Diet) : null,
        quantity: i.quantity,
        lineTotalPaise: i.line_total_paise,
      }));
    const cash = orderCash({
      totalPaise: b.total_paise,
      paidPaise: b.paid_paise,
      refundedPaise: b.refunded_paise,
    });
    const address = orderAddress(o.address);
    return [
      {
        id: o.id,
        code: b.code,
        status: o.status,
        kind: o.kind,
        storeId: o.store_id,
        storeName: storeNames.get(o.store_id) ?? null,
        placedAt: o.placed_at,
        createdAt: o.created_at,
        etaAt: o.eta_at,
        deliveredAt: o.delivered_at,
        customerName: address.name || b.contact_name,
        customerPhone: address.phone || b.contact_phone,
        address,
        notes: b.special_requests?.trim() || null,
        items: lines,
        itemCount: lines.reduce((s, l) => s + l.quantity, 0),
        totalPaise: b.total_paise,
        cod: b.payment_mode === "pay_at_hotel",
        collectPaise: cash.collectPaise,
        paidOnlinePaise: cash.paidOnlinePaise,
        partner: o.partner_id
          ? { id: o.partner_id, name: o.partner_name ?? "", phone: o.partner_phone }
          : null,
        selfDelivery: deliversItself(o.partner_id, ownRiders),
      },
    ];
  });
}

/**
 * Live orders (every open one) plus today's finished ones, newest first.
 * Feeds both the orders board and the home summary.
 */
export async function getVendorOrders(ctx: VendorContext, now: Date): Promise<VendorOrder[]> {
  if (ctx.vendorIds.length === 0) return [];
  const supabase = await createClient();
  const since = indiaDayStart(now).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("vendor_id", ctx.vendorIds)
    .neq("status", "awaiting_payment")
    .or(`status.in.(${BOARD_COLUMNS.join(",")}),updated_at.gte."${since}"`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail("orders", error);
  return hydrate(ctx, data ?? []);
}

export type VendorRating = {
  id: string;
  code: string;
  storeName: LocalizedJson | null;
  rating: number;
  comment: string | null;
  ratedAt: string;
};

/** The latest rated orders (up to 200) for the average and the list. */
export async function getVendorRatings(ctx: VendorContext): Promise<VendorRating[]> {
  if (ctx.vendorIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, booking_id, store_id, rating, rating_comment, rated_at")
    .in("vendor_id", ctx.vendorIds)
    .not("rated_at", "is", null)
    .order("rated_at", { ascending: false })
    .limit(200);
  if (error) fail("ratings", error);
  const rows = (data ?? []).filter((r) => r.rating !== null && r.rated_at !== null);
  if (rows.length === 0) return [];
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, code")
    .in(
      "id",
      rows.map((r) => r.booking_id),
    );
  if (bErr) fail("rating bookings", bErr);
  const codes = new Map((bookings ?? []).map((b) => [b.id, b.code]));
  const storeNames = new Map(ctx.stores.map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    id: r.id,
    code: codes.get(r.booking_id) ?? "",
    storeName: storeNames.get(r.store_id) ?? null,
    rating: r.rating ?? 0,
    comment: r.rating_comment,
    ratedAt: r.rated_at ?? "",
  }));
}

export type RiderOption = {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  own: boolean;
};

/** The vendor's own riders (all, for the riders page). */
export async function getOwnRiders(ctx: VendorContext): Promise<(RiderOption & { isActive: boolean })[]> {
  if (ctx.vendorIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_partners")
    .select("id, full_name, phone, vehicle, is_active")
    .in("vendor_id", ctx.vendorIds)
    .is("deleted_at", null)
    .order("full_name");
  if (error) fail("riders", error);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.full_name,
    phone: r.phone,
    vehicle: r.vehicle,
    own: true,
    isActive: r.is_active,
  }));
}

/**
 * Riders a store can assign: its own active riders, then platform riders.
 * Platform riders are not readable by vendors under RLS, so their names
 * (no phone numbers) are read with the service role, for members only.
 */
export async function getAssignableRiders(ctx: VendorContext): Promise<RiderOption[]> {
  const own: RiderOption[] = (await getOwnRiders(ctx))
    .filter((r) => r.isActive)
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone, vehicle: r.vehicle, own: true }));
  if (ctx.vendorIds.length === 0 || !hasServiceRole()) return own;
  const { data, error } = await createAdminClient()
    .from("delivery_partners")
    .select("id, full_name, vehicle")
    .is("vendor_id", null)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name")
    .limit(100);
  if (error) fail("platform riders", error);
  return [
    ...own,
    ...(data ?? []).map((r) => ({
      id: r.id,
      name: r.full_name,
      phone: null,
      vehicle: r.vehicle,
      own: false,
    })),
  ];
}

export type VendorMenuVariant = {
  id: string;
  name: LocalizedJson;
  pricePaise: number;
  stock: number | null;
  isAvailable: boolean;
};
export type VendorMenuAddon = { id: string; name: LocalizedJson; pricePaise: number; isAvailable: boolean };
export type VendorMenuItem = {
  id: string;
  categoryId: string | null;
  name: LocalizedJson;
  diet: Diet;
  pricePaise: number;
  mrpPaise: number | null;
  trackStock: boolean;
  stock: number | null;
  isAvailable: boolean;
  variants: VendorMenuVariant[];
  addonGroups: { id: string; name: LocalizedJson; addons: VendorMenuAddon[] }[];
};
export type VendorMenu = {
  categories: { id: string; name: LocalizedJson; isActive: boolean }[];
  items: VendorMenuItem[];
};

/** A store's whole menu, hidden categories included (the store must be the user's). */
export async function getVendorMenu(ctx: VendorContext, storeId: string): Promise<VendorMenu | null> {
  if (!ctx.stores.some((s) => s.id === storeId)) return null;
  const supabase = await createClient();
  const [cats, items] = await Promise.all([
    supabase
      .from("store_categories")
      .select("id, name, is_active, sort_order")
      .eq("store_id", storeId)
      .order("sort_order"),
    supabase
      .from("store_items")
      .select(
        "id, category_id, name, diet, price_paise, mrp_paise, track_stock, stock, is_available, sort_order",
      )
      .eq("store_id", storeId)
      .order("sort_order"),
  ]);
  if (cats.error) fail("categories", cats.error);
  if (items.error) fail("items", items.error);
  const itemIds = (items.data ?? []).map((i) => i.id);
  const [variants, groups] = itemIds.length
    ? await Promise.all([
        supabase
          .from("item_variants")
          .select("id, item_id, name, price_paise, stock, is_available, sort_order")
          .in("item_id", itemIds)
          .order("sort_order"),
        supabase
          .from("item_addon_groups")
          .select("id, item_id, name, sort_order")
          .in("item_id", itemIds)
          .order("sort_order"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (variants.error) fail("variants", variants.error);
  if (groups.error) fail("addon groups", groups.error);
  const groupIds = (groups.data ?? []).map((g) => g.id);
  const addons = groupIds.length
    ? await supabase
        .from("item_addons")
        .select("id, group_id, name, price_paise, is_available, sort_order")
        .in("group_id", groupIds)
        .order("sort_order")
    : { data: [], error: null };
  if (addons.error) fail("addons", addons.error);

  return {
    categories: (cats.data ?? []).map((c) => ({ id: c.id, name: c.name, isActive: c.is_active })),
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      categoryId: i.category_id,
      name: i.name,
      diet: i.diet,
      pricePaise: i.price_paise,
      mrpPaise: i.mrp_paise,
      trackStock: i.track_stock,
      stock: i.stock,
      isAvailable: i.is_available,
      variants: (variants.data ?? [])
        .filter((v) => v.item_id === i.id)
        .map((v) => ({
          id: v.id,
          name: v.name,
          pricePaise: v.price_paise,
          stock: v.stock,
          isAvailable: v.is_available,
        })),
      addonGroups: (groups.data ?? [])
        .filter((g) => g.item_id === i.id)
        .map((g) => ({
          id: g.id,
          name: g.name,
          addons: (addons.data ?? [])
            .filter((a) => a.group_id === g.id)
            .map((a) => ({ id: a.id, name: a.name, pricePaise: a.price_paise, isAvailable: a.is_available })),
        })),
    })),
  };
}
