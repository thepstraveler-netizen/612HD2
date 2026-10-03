"use server";

import { otpAttemptAllowed } from "@/lib/bookings/otp-attempts";
import { revalidatePath, revalidateTag } from "next/cache";
import type { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { BookingError } from "@/lib/bookings/service";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { publicEnv } from "@/lib/env";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  menuChangeSchema,
  storeAcceptingSchema,
  vendorAssignSchema,
  vendorMoveSchema,
  vendorOrderRefSchema,
} from "@/schemas/delivery-vendor";
import { assignRider, moveOrder, riderOrderUrl } from "./service";
import { actionError, type ActionError } from "./vendor-ui";

/**
 * Vendor dashboard actions. Each one re-parses its input, then checks that
 * the signed-in user is a member of the vendor that owns the order or
 * store (vendor_members) before writing. Order moves and rider assignment
 * run through the same database functions as the admin board, with the
 * store as the source; catalog edits go through the user's own client so
 * RLS (can_manage_store) applies as well.
 */

export type VendorActionResult = { ok: true } | { ok: false; error: ActionError };
export type VendorAssignResult =
  { ok: true; link: string | null; riderPhone: string | null } | { ok: false; error: ActionError };
export type VendorLinkResult =
  { ok: true; link: string; riderPhone: string | null } | { ok: false; error: ActionError };

type Scope = { userId: string; vendorIds: string[] };

async function vendorScope(): Promise<Scope | null> {
  const session = await getSession();
  if (!session || session.profile?.is_blocked) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_members")
    .select("vendor_id")
    .eq("user_id", session.user.id);
  if (error || !data?.length) return null;
  return { userId: session.user.id, vendorIds: data.map((m) => m.vendor_id) };
}

/** The order, when it belongs to one of the caller's vendors. */
async function ownOrder(orderId: string, scope: Scope) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, vendor_id, status, partner_id")
    .eq("id", orderId)
    .maybeSingle();
  return data && scope.vendorIds.includes(data.vendor_id) ? data : null;
}

function failure(error: unknown, scope: string): { ok: false; error: ActionError } {
  if (error instanceof BookingError) return { ok: false, error: actionError(error.code) };
  console.error(`[vendor] ${scope} failed`, error);
  return { ok: false, error: "unknown" };
}

async function guarded<S extends z.ZodType, R extends { ok: boolean }>(
  schema: S,
  input: unknown,
  run: (data: z.output<S>, scope: Scope) => Promise<R | { ok: false; error: ActionError }>,
): Promise<R | { ok: false; error: ActionError }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const scope = await vendorScope();
  if (!scope) return { ok: false, error: "forbidden" };
  return run(parsed.data, scope);
}

const refresh = () => revalidatePath("/[locale]/vendor", "layout");

/** Accept, reject (with a reason), prepare, ready, out for delivery, delivered (with the OTP). */
export async function vendorMoveOrder(input: unknown): Promise<VendorActionResult> {
  return guarded(vendorMoveSchema, input, async (data, scope) => {
    if (!hasServiceRole()) return { ok: false, error: "unavailable" };
    const order = await ownOrder(data.orderId, scope);
    if (!order) return { ok: false, error: "not_found" };
    // Locked after too many tries; reported like a wrong code (D-098).
    if (data.otp && !(await otpAttemptAllowed("order", order.id)))
      return { ok: false, error: "otp_mismatch" };
    try {
      await moveOrder({
        orderId: order.id,
        status: data.status,
        actor: scope.userId,
        source: "vendor",
        note: data.note || null,
        otp: data.otp ?? null,
      });
    } catch (error) {
      return failure(error, "move");
    }
    refresh();
    return { ok: true };
  });
}

/** The current rider link, for a rider of the store's own (platform riders get theirs from the office). */
async function ownRiderLink(orderId: string, scope: Scope): Promise<VendorLinkResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("partner_id, partner_phone, partner_token, partner_token_expires_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.partner_id || !order.partner_token) return { ok: false, error: "no_link" };
  if (order.partner_token_expires_at && Date.parse(order.partner_token_expires_at) < Date.now()) {
    return { ok: false, error: "no_link" };
  }
  const { data: rider } = await admin
    .from("delivery_partners")
    .select("vendor_id")
    .eq("id", order.partner_id)
    .maybeSingle();
  if (!rider?.vendor_id || !scope.vendorIds.includes(rider.vendor_id)) return { ok: false, error: "no_link" };
  return {
    ok: true,
    link: riderOrderUrl(publicEnv().NEXT_PUBLIC_SITE_URL, order.partner_token),
    riderPhone: order.partner_phone,
  };
}

/** Assigns one of the store's riders or a platform rider (the database checks which are allowed). */
export async function vendorAssignRider(input: unknown): Promise<VendorAssignResult> {
  return guarded(vendorAssignSchema, input, async (data, scope) => {
    if (!hasServiceRole()) return { ok: false, error: "unavailable" };
    const order = await ownOrder(data.orderId, scope);
    if (!order) return { ok: false, error: "not_found" };
    try {
      await assignRider(order.id, data.partnerId, scope.userId, "vendor");
    } catch (error) {
      return failure(error, "assign");
    }
    refresh();
    const link = await ownRiderLink(order.id, scope);
    return link.ok
      ? { ok: true, link: link.link, riderPhone: link.riderPhone }
      : { ok: true, link: null, riderPhone: null };
  });
}

export async function vendorRiderLink(input: unknown): Promise<VendorLinkResult> {
  return guarded(vendorOrderRefSchema, input, async (data, scope) => {
    if (!hasServiceRole()) return { ok: false, error: "unavailable" };
    const order = await ownOrder(data.orderId, scope);
    if (!order) return { ok: false, error: "not_found" };
    return ownRiderLink(order.id, scope);
  });
}

/** Pauses or resumes new orders for one store. Store rows are staff-managed under RLS, so this writes with the service role. */
export async function setStoreAccepting(input: unknown): Promise<VendorActionResult> {
  return guarded(storeAcceptingSchema, input, async (data, scope) => {
    if (!hasServiceRole()) return { ok: false, error: "unavailable" };
    const supabase = await createClient();
    const { data: store } = await supabase
      .from("stores")
      .select("id, vendor_id")
      .eq("id", data.storeId)
      .maybeSingle();
    if (!store || !scope.vendorIds.includes(store.vendor_id)) return { ok: false, error: "not_found" };
    const { error } = await createAdminClient()
      .from("stores")
      .update({ accepting_orders: data.accepting })
      .eq("id", store.id);
    if (error) return failure(error, "pause");
    revalidateTag(CATALOG_TAG);
    refresh();
    return { ok: true };
  });
}

/** The store an item, variant or add-on belongs to (catalog rows are public reads). */
async function storeOfEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "item" | "variant" | "addon",
  id: string,
): Promise<string | null> {
  let itemId = id;
  if (kind === "addon") {
    const { data: addon } = await supabase.from("item_addons").select("group_id").eq("id", id).maybeSingle();
    if (!addon) return null;
    const { data: group } = await supabase
      .from("item_addon_groups")
      .select("item_id")
      .eq("id", addon.group_id)
      .maybeSingle();
    if (!group) return null;
    itemId = group.item_id;
  } else if (kind === "variant") {
    const { data: variant } = await supabase
      .from("item_variants")
      .select("item_id")
      .eq("id", id)
      .maybeSingle();
    if (!variant) return null;
    itemId = variant.item_id;
  }
  const { data: item } = await supabase.from("store_items").select("store_id").eq("id", itemId).maybeSingle();
  return item?.store_id ?? null;
}

/** Availability, stock and price edits from the menu page. */
export async function updateMenuEntry(input: unknown): Promise<VendorActionResult> {
  return guarded(menuChangeSchema, input, async (change, scope) => {
    const supabase = await createClient();
    const storeId = await storeOfEntry(supabase, change.kind, change.id);
    if (!storeId) return { ok: false, error: "not_found" };
    const { data: store } = await supabase.from("stores").select("vendor_id").eq("id", storeId).maybeSingle();
    if (!store || !scope.vendorIds.includes(store.vendor_id)) return { ok: false, error: "forbidden" };

    let result: { data: { id: string }[] | null; error: { message: string } | null };
    if (change.kind === "item") {
      if (change.pricePaise !== undefined) {
        const { data: item } = await supabase
          .from("store_items")
          .select("mrp_paise")
          .eq("id", change.id)
          .maybeSingle();
        if (item?.mrp_paise != null && change.pricePaise > item.mrp_paise)
          return { ok: false, error: "price_above_mrp" };
      }
      result = await supabase
        .from("store_items")
        .update({
          ...(change.isAvailable !== undefined ? { is_available: change.isAvailable } : {}),
          ...(change.stock !== undefined ? { stock: change.stock, track_stock: change.stock !== null } : {}),
          ...(change.pricePaise !== undefined ? { price_paise: change.pricePaise } : {}),
        })
        .eq("id", change.id)
        .select("id");
    } else if (change.kind === "variant") {
      result = await supabase
        .from("item_variants")
        .update({
          ...(change.isAvailable !== undefined ? { is_available: change.isAvailable } : {}),
          ...(change.stock !== undefined ? { stock: change.stock } : {}),
          ...(change.pricePaise !== undefined ? { price_paise: change.pricePaise } : {}),
        })
        .eq("id", change.id)
        .select("id");
    } else {
      result = await supabase
        .from("item_addons")
        .update({
          ...(change.isAvailable !== undefined ? { is_available: change.isAvailable } : {}),
          ...(change.pricePaise !== undefined ? { price_paise: change.pricePaise } : {}),
        })
        .eq("id", change.id)
        .select("id");
    }
    if (result.error) return failure(result.error, "menu");
    // RLS filters rows the user may not change: nothing updated means no access.
    if (!result.data?.length) return { ok: false, error: "forbidden" };
    revalidateTag(CATALOG_TAG);
    revalidatePath("/[locale]/vendor/menu", "page");
    return { ok: true };
  });
}
