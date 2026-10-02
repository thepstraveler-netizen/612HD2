import "server-only";
import { indiaDayBounds } from "@/lib/cabs/admin-rows";
import type { IsoDate } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PrescriptionStatus, StoreKind } from "@/schemas/delivery";
import type { Tables } from "@/types/database";
import { FINISHED_STATUSES, settlementSummary, VENDOR_KINDS_FOR } from "./admin-rows";
import { BOARD_COLUMNS } from "./status";

/**
 * Admin reads for food, essentials and medicine. Catalog, riders, orders
 * and prescriptions are read as the signed-in user (RLS: food.read /
 * medicine.read), uncached, inactive rows included. Vendor names and
 * booking contact / payment details need the service role (staff without
 * vendors.read or bookings.read run the board): the callers have already
 * checked the module permission (requirePermission) and only those columns
 * leave here. The rider link token is never read here (see admin-actions).
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[delivery admin] ${scope}: ${error.message}`);
}

const BOARD_LIMIT = 300;
/** Finished orders stay on the board's recent list this long. */
const RECENT_HOURS = 24;

type Option = { value: string; label: string };

async function mediaUrls(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("media").select("id, path").in("id", wanted);
  if (error) fail("media", error);
  const out = new Map<string, string>();
  for (const m of data) {
    const url = mediaUrl(m.path);
    if (url) out.set(m.id, url);
  }
  return out;
}

// ---------------------------------------------------------------- vendors

export type VendorInfo = {
  id: string;
  name: string;
  kind: Tables<"vendors">["kind"];
  commission_bps: number;
};

/** Vendor names and commission (service role; the caller checked food.read or medicine.read). */
export async function vendorInfo(ids?: string[]): Promise<Map<string, VendorInfo>> {
  let query = createAdminClient().from("vendors").select("id, name, kind, commission_bps");
  if (ids) {
    if (!ids.length) return new Map();
    query = query.in("id", [...new Set(ids)]);
  }
  const { data, error } = await query;
  if (error) fail("vendors", error);
  return new Map(data.map((v) => [v.id, v]));
}

/** Vendors that may own a store of these kinds, for the store form (service role, as above). */
export async function listVendorOptions(kinds: readonly StoreKind[], currentId?: string): Promise<Option[]> {
  const vendorKinds = [...new Set(kinds.flatMap((k) => VENDOR_KINDS_FOR[k]))];
  const { data, error } = await createAdminClient()
    .from("vendors")
    .select("id, name, kind, deleted_at")
    .in("kind", vendorKinds)
    .order("name");
  if (error) fail("vendor options", error);
  return data
    .filter((v) => v.deleted_at === null || v.id === currentId)
    .map((v) => ({ value: v.id, label: v.name }));
}

// ---------------------------------------------------------------- stores

export async function listAdminStores(kinds: readonly StoreKind[]) {
  const supabase = await createClient();
  const [stores, zones] = await Promise.all([
    supabase
      .from("stores")
      .select("*")
      .in("kind", [...kinds])
      .is("deleted_at", null)
      .order("sort_order")
      .order("slug"),
    supabase.from("store_zones").select("store_id"),
  ]);
  if (stores.error) fail("stores", stores.error);
  if (zones.error) fail("store zones", zones.error);
  const vendors = await vendorInfo(stores.data.map((s) => s.vendor_id));
  const zoneCount = new Map<string, number>();
  for (const z of zones.data) zoneCount.set(z.store_id, (zoneCount.get(z.store_id) ?? 0) + 1);
  return stores.data.map((s) => ({
    ...s,
    vendorName: vendors.get(s.vendor_id)?.name ?? "–",
    zoneCount: zoneCount.get(s.id) ?? 0,
  }));
}

/** A store of one of these kinds, its served zones and image preview. */
export async function getAdminStore(id: string, kinds: readonly StoreKind[]) {
  const supabase = await createClient();
  const [store, zones] = await Promise.all([
    supabase
      .from("stores")
      .select("*")
      .eq("id", id)
      .in("kind", [...kinds])
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("store_zones").select("zone_id").eq("store_id", id),
  ]);
  if (store.error) fail("store", store.error);
  if (zones.error) fail("store zones", zones.error);
  if (!store.data) return null;
  const images = await mediaUrls([store.data.image_id]);
  return {
    store: store.data,
    zoneIds: zones.data.map((z) => z.zone_id),
    imageUrl: store.data.image_id ? (images.get(store.data.image_id) ?? null) : null,
  };
}

/** Store names for the board filter and the pharmacy picker. */
export async function storeOptions(
  kinds: readonly StoreKind[],
  locale: string,
  activeOnly = false,
): Promise<Option[]> {
  const supabase = await createClient();
  let query = supabase
    .from("stores")
    .select("id, name, is_active")
    .in("kind", [...kinds])
    .is("deleted_at", null);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("sort_order");
  if (error) fail("store options", error);
  return data.map((s) => ({ value: s.id, label: pickLocalized(s.name, locale) }));
}

// ---------------------------------------------------------------- menu

export type AdminMenu = {
  categories: Tables<"store_categories">[];
  items: (Tables<"store_items"> & { imageUrl: string | null })[];
  variants: Tables<"item_variants">[];
  groups: Tables<"item_addon_groups">[];
  addons: Tables<"item_addons">[];
};

/** Everything on a store's menu, inactive and unavailable rows included. */
export async function getAdminMenu(storeId: string): Promise<AdminMenu> {
  const supabase = await createClient();
  const [categories, items] = await Promise.all([
    supabase
      .from("store_categories")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order")
      .order("created_at"),
    supabase.from("store_items").select("*").eq("store_id", storeId).order("sort_order").order("created_at"),
  ]);
  if (categories.error) fail("categories", categories.error);
  if (items.error) fail("items", items.error);
  const itemIds = items.data.map((i) => i.id);
  const [variants, groups, images] = await Promise.all([
    itemIds.length
      ? supabase
          .from("item_variants")
          .select("*")
          .in("item_id", itemIds)
          .order("sort_order")
          .order("created_at")
      : null,
    itemIds.length
      ? supabase
          .from("item_addon_groups")
          .select("*")
          .in("item_id", itemIds)
          .order("sort_order")
          .order("created_at")
      : null,
    mediaUrls(items.data.map((i) => i.image_id)),
  ]);
  if (variants?.error) fail("variants", variants.error);
  if (groups?.error) fail("addon groups", groups.error);
  const groupIds = (groups?.data ?? []).map((g) => g.id);
  const addons = groupIds.length
    ? await supabase
        .from("item_addons")
        .select("*")
        .in("group_id", groupIds)
        .order("sort_order")
        .order("created_at")
    : null;
  if (addons?.error) fail("addons", addons.error);
  return {
    categories: categories.data,
    items: items.data.map((i) => ({ ...i, imageUrl: i.image_id ? (images.get(i.image_id) ?? null) : null })),
    variants: variants?.data ?? [],
    groups: groups?.data ?? [],
    addons: addons?.data ?? [],
  };
}

// ---------------------------------------------------------------- zones and riders

export async function listDeliveryZones() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("delivery_zones").select("*").order("sort_order").order("slug");
  if (error) fail("zones", error);
  return data;
}

export async function getDeliveryZone(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("delivery_zones").select("*").eq("id", id).maybeSingle();
  if (error) fail("zone", error);
  return data;
}

export async function listRiders() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_partners")
    .select("*")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("full_name");
  if (error) fail("riders", error);
  return data;
}

export async function getRider(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_partners")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("rider", error);
  return data;
}

export type RiderOption = { id: string; label: string; vendorId: string | null };

/** Active riders for the assign dialog (the board filters them per order's vendor). */
export async function riderOptions(): Promise<RiderOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_partners")
    .select("id, full_name, phone, vendor_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name");
  if (error) fail("rider options", error);
  return data.map((r) => ({ id: r.id, label: `${r.full_name} · ${r.phone}`, vendorId: r.vendor_id }));
}

// ---------------------------------------------------------------- orders

export type OrderBookingInfo = {
  id: string;
  code: string;
  contact_name: string;
  contact_phone: string;
  payment_mode: string;
  total_paise: number;
  paid_paise: number;
};

async function bookingInfo(ids: string[]): Promise<Map<string, OrderBookingInfo>> {
  if (!ids.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id, code, contact_name, contact_phone, payment_mode, total_paise, paid_paise")
    .in("id", [...new Set(ids)]);
  if (error) fail("bookings", error);
  return new Map(data.map((b) => [b.id, b]));
}

/** Every column except the rider link token and the customer's delivery OTP (neither is granted to staff). */
const ORDER_COLUMNS =
  "id, booking_id, store_id, vendor_id, kind, zone_id, address, status, prescription_id, partner_id, partner_name, partner_phone, eta_at, placed_at, accepted_at, ready_at, picked_up_at, delivered_at, rating, rating_comment, rated_at, created_at, updated_at";

export type AdminOrder = Omit<
  Tables<"orders">,
  "partner_token" | "partner_token_expires_at" | "delivery_otp"
> & {
  booking: OrderBookingInfo | null;
  items: Pick<Tables<"order_items">, "name" | "variant_name" | "quantity">[];
  storeName: string;
  zoneName: string;
};

/**
 * The live board for some store kinds: open orders (placed → out for
 * delivery, any age) plus orders finished in the last 24 hours. Unpaid
 * online orders (awaiting_payment) are not shown.
 */
export async function listBoardOrders(
  kinds: readonly StoreKind[],
  locale: string,
  storeId?: string,
): Promise<AdminOrder[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString();
  let query = supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("kind", [...kinds])
    .or(
      `status.in.(${BOARD_COLUMNS.join(",")}),and(status.in.(${FINISHED_STATUSES.join(",")}),updated_at.gte."${since}")`,
    );
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query.order("created_at").limit(BOARD_LIMIT);
  if (error) fail("board", error);
  const orderIds = data.map((o) => o.id);
  const [info, items, stores, zones] = await Promise.all([
    bookingInfo(data.map((o) => o.booking_id)),
    orderIds.length
      ? supabase
          .from("order_items")
          .select("order_id, name, variant_name, quantity, sort_order")
          .in("order_id", orderIds)
          .order("sort_order")
      : null,
    supabase
      .from("stores")
      .select("id, name")
      .in("kind", [...kinds]),
    supabase.from("delivery_zones").select("id, name"),
  ]);
  if (items?.error) fail("order items", items.error);
  if (stores.error) fail("stores", stores.error);
  if (zones.error) fail("zones", zones.error);
  const storeName = new Map(stores.data.map((s) => [s.id, pickLocalized(s.name, locale)]));
  const zoneName = new Map(zones.data.map((z) => [z.id, pickLocalized(z.name, locale)]));
  const itemsByOrder = new Map<string, AdminOrder["items"]>();
  for (const i of items?.data ?? []) {
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push({ name: i.name, variant_name: i.variant_name, quantity: i.quantity });
    itemsByOrder.set(i.order_id, list);
  }
  return data.map((o) => ({
    ...o,
    booking: info.get(o.booking_id) ?? null,
    items: itemsByOrder.get(o.id) ?? [],
    storeName: storeName.get(o.store_id) ?? "–",
    zoneName: zoneName.get(o.zone_id) ?? "–",
  }));
}

// ---------------------------------------------------------------- settlements

/** Delivered orders of these kinds in an India date range, summed per vendor. */
export async function getSettlement(kinds: readonly StoreKind[], from: IsoDate, to: IsoDate) {
  const supabase = await createClient();
  const { start, end } = indiaDayBounds(from, to);
  const { data, error } = await supabase
    .from("orders")
    .select("booking_id, vendor_id")
    .in("kind", [...kinds])
    .eq("status", "delivered")
    .gte("delivered_at", start as string)
    .lt("delivered_at", end as string)
    .limit(10_000);
  if (error) fail("settlement orders", error);
  const [info, vendors] = await Promise.all([
    bookingInfo(data.map((o) => o.booking_id)),
    vendorInfo(data.map((o) => o.vendor_id)),
  ]);
  return settlementSummary(
    data.map((o) => {
      const b = info.get(o.booking_id);
      return {
        vendor_id: o.vendor_id,
        total_paise: b?.total_paise ?? 0,
        payment_mode: b?.payment_mode ?? "full",
      };
    }),
    vendors,
  );
}

// ---------------------------------------------------------------- prescriptions

export async function listPrescriptions(statuses: PrescriptionStatus[] | null) {
  const supabase = await createClient();
  let query = supabase
    .from("prescriptions")
    .select("id, patient_name, patient_age, phone, zone_id, files, status, store_id, created_at, updated_at");
  if (statuses) query = query.in("status", statuses);
  const { data, error } = await query
    .order("created_at", { ascending: !statuses || statuses.includes("submitted") })
    .limit(300);
  if (error) fail("prescriptions", error);
  return data;
}

/** Counts per status for the queue tabs. */
export async function prescriptionCounts(): Promise<Partial<Record<PrescriptionStatus, number>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("prescriptions").select("status").limit(5000);
  if (error) fail("prescription counts", error);
  const out: Partial<Record<PrescriptionStatus, number>> = {};
  for (const p of data) out[p.status] = (out[p.status] ?? 0) + 1;
  return out;
}

/** Signed links to a prescription's files stay valid this long (seconds). */
const SIGNED_URL_SECONDS = 300;

export type PrescriptionFile = { path: string; url: string | null; isPdf: boolean };

/**
 * One prescription with its quotes and short-lived signed links to the
 * uploaded files (private bucket, signed with the service role after the
 * caller checked medicine.read).
 */
export async function getPrescription(id: string) {
  const supabase = await createClient();
  const [prescription, quotes] = await Promise.all([
    supabase.from("prescriptions").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("medicine_quotes")
      .select("*")
      .eq("prescription_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (prescription.error) fail("prescription", prescription.error);
  if (quotes.error) fail("quotes", quotes.error);
  if (!prescription.data) return null;
  const storage = createAdminClient().storage.from("prescriptions");
  const files: PrescriptionFile[] = await Promise.all(
    prescription.data.files.map(async (path) => {
      const { data } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS);
      return { path, url: data?.signedUrl ?? null, isPdf: path.toLowerCase().endsWith(".pdf") };
    }),
  );
  return { prescription: prescription.data, quotes: quotes.data, files };
}

/** The patient's account email and language, for the quote / rejection message (service role). */
export async function patientContact(userId: string) {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("email, full_name, preferred_locale")
    .eq("id", userId)
    .maybeSingle();
  if (error) fail("profile", error);
  return data;
}

/** Zone names in the viewer's language. */
export async function zoneNames(locale: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("delivery_zones").select("id, name");
  if (error) fail("zone names", error);
  return new Map(data.map((z) => [z.id, pickLocalized(z.name, locale)]));
}
