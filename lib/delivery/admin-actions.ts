"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { mutate, type MutationResult, type Supabase } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { BookingError } from "@/lib/bookings/service";
import { publicEnv } from "@/lib/env";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { notify } from "@/lib/notifications/service";
import type { PermissionKey } from "@/lib/permissions/constants";
import { finalizePrice } from "@/lib/pricing/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { mediaRegisterSchema } from "@/schemas/cms";
import { deliverySettingsSchema, quoteLinesSchema, type StoreKind } from "@/schemas/delivery";
import {
  addonFormSchema,
  addonGroupFormSchema,
  categoryFormSchema,
  deliveryIdSchema,
  deliverySettingsFormSchema,
  deliveryZoneFormSchema,
  FOOD_KINDS,
  itemAvailabilitySchema,
  itemFormSchema,
  itemStockSchema,
  orderAssignSchema,
  orderMoveSchema,
  orderRefSchema,
  prescriptionAssignSchema,
  prescriptionRejectSchema,
  quoteFormSchema,
  riderFormSchema,
  storeFormSchema,
  storeToggleSchema,
  variantFormSchema,
} from "@/schemas/delivery-admin";
import type { Json } from "@/types/database";
import { patientContact } from "./admin";
import {
  addonGroupRow,
  addonRow,
  categoryRow,
  deliveryErrorKey,
  deliverySettingsValue,
  deliveryZoneRow,
  itemRow,
  prescriptionUrl,
  quoteFormLines,
  quoteValidUntil,
  riderRow,
  storeRow,
  variantRow,
} from "./admin-rows";
import { buildQuoteLines } from "./cart";
import { getDeliverySettings } from "./queries";
import { assignRider, moveOrder, riderLink } from "./service";

/**
 * Food, essentials and medicine admin mutations.
 *
 * Catalog, riders, zones, prescriptions, quotes and settings go through
 * {@link mutate}: food.write (restaurants, grocery stores, menus, zones and
 * riders), medicine.write (pharmacies, prescriptions, quotes) or
 * settings.write (Settings → Delivery); zod; an RLS write as the staff
 * user, audited by the table triggers; the public catalog cache cleared.
 *
 * Dispatch (status moves, rider assignment) calls the service-role-only SQL
 * functions through lib/delivery/service.ts after checking food.write or
 * medicine.write (by the order's store kind) here, passing the staff user as
 * the actor so the order events and the audit log record who did it. The
 * rider link token is read the same way, one order at a time, for readers.
 */

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
const invalidContent = { message: "invalidContent", code: "invalidContent" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

const kindPermission = (kind: StoreKind, access: "read" | "write"): PermissionKey =>
  kind === "pharmacy" ? `medicine.${access}` : `food.${access}`;

// ---------------------------------------------------------------- media

/** Registers a store or item image the browser uploaded to the `media` bucket. */
export async function registerDeliveryMedia(input: unknown) {
  return mutate("food.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function registerPharmacyMedia(input: unknown) {
  return mutate("medicine.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

// ---------------------------------------------------------------- stores

/** Makes the store's served zones exactly `zoneIds`. */
async function syncStoreZones(supabase: Supabase, storeId: string, zoneIds: string[]) {
  const { data: current, error } = await supabase
    .from("store_zones")
    .select("zone_id")
    .eq("store_id", storeId);
  if (error) return error;
  const have = new Set(current.map((z) => z.zone_id));
  const removed = [...have].filter((z) => !zoneIds.includes(z));
  const added = zoneIds.filter((z) => !have.has(z));
  if (removed.length) {
    const { error: e } = await supabase
      .from("store_zones")
      .delete()
      .eq("store_id", storeId)
      .in("zone_id", removed);
    if (e) return e;
  }
  if (added.length) {
    const { error: e } = await supabase
      .from("store_zones")
      .insert(added.map((zone_id) => ({ store_id: storeId, zone_id })));
    if (e) return e.code === FK_VIOLATION ? notFound : e;
  }
  return null;
}

async function writeStore(
  form: z.output<typeof storeFormSchema>,
  supabase: Supabase,
  kinds: readonly StoreKind[],
) {
  if (!kinds.includes(form.kind)) return { error: invalidContent };
  const row = storeRow(form);
  const { data, error } = form.id
    ? await supabase
        .from("stores")
        .update(row)
        .eq("id", form.id)
        .in("kind", [...kinds])
        .is("deleted_at", null)
        .select("id")
        .single()
    : await supabase.from("stores").insert(row).select("id").single();
  if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
  const zoneError = await syncStoreZones(supabase, data.id, form.zone_ids);
  return zoneError ? { error: zoneError } : { id: data.id };
}

/** A restaurant or grocery store with its served zones. */
export async function saveStore(input: unknown) {
  return mutate("food.write", storeFormSchema, input, (form, supabase) =>
    writeStore(form, supabase, FOOD_KINDS),
  );
}

/** A partner pharmacy (drug licence required) with its served zones. */
export async function savePharmacy(input: unknown) {
  return mutate("medicine.write", storeFormSchema, input, (form, supabase) =>
    writeStore(form, supabase, ["pharmacy"]),
  );
}

async function softDeleteStore(id: string, supabase: Supabase, kinds: readonly StoreKind[]) {
  const { data, error } = await supabase
    .from("stores")
    .update({ deleted_at: new Date().toISOString(), is_active: false, accepting_orders: false })
    .eq("id", id)
    .in("kind", [...kinds])
    .select("id")
    .maybeSingle();
  if (error) return { error };
  return data ? {} : { error: notFound };
}

/** Soft delete: past orders keep pointing at the store; it leaves the shop and every list. */
export async function deleteStore(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, ({ id }, supabase) =>
    softDeleteStore(id, supabase, FOOD_KINDS),
  );
}

export async function deletePharmacy(input: unknown) {
  return mutate("medicine.write", deliveryIdSchema, input, ({ id }, supabase) =>
    softDeleteStore(id, supabase, ["pharmacy"]),
  );
}

async function toggleStore(
  form: z.output<typeof storeToggleSchema>,
  supabase: Supabase,
  kinds: readonly StoreKind[],
) {
  const { data, error } = await supabase
    .from("stores")
    .update({ accepting_orders: form.accepting_orders })
    .eq("id", form.id)
    .in("kind", [...kinds])
    .select("id")
    .maybeSingle();
  if (error) return { error };
  return data ? { id: data.id } : { error: notFound };
}

/** Pause or resume orders (the store can do the same from its dashboard). */
export async function setStoreAccepting(input: unknown) {
  return mutate("food.write", storeToggleSchema, input, (form, supabase) =>
    toggleStore(form, supabase, FOOD_KINDS),
  );
}

export async function setPharmacyAccepting(input: unknown) {
  return mutate("medicine.write", storeToggleSchema, input, (form, supabase) =>
    toggleStore(form, supabase, ["pharmacy"]),
  );
}

// ---------------------------------------------------------------- menu

export async function saveCategory(input: unknown) {
  return mutate("food.write", categoryFormSchema, input, async (form, supabase) => {
    const row = categoryRow(form);
    const { data, error } = form.id
      ? await supabase.from("store_categories").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("store_categories").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Items in a deleted category stay on the menu, uncategorised (category_id is set null). */
export async function deleteCategory(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("store_categories").delete().eq("id", id)).error,
  }));
}

export async function saveItem(input: unknown) {
  return mutate("food.write", itemFormSchema, input, async (form, supabase) => {
    const row = itemRow(form);
    const { data, error } = form.id
      ? await supabase.from("store_items").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("store_items").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Past orders keep their copy of the item (order_items.item_id is set null); variants and add-ons go with it. */
export async function deleteItem(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("store_items").delete().eq("id", id)).error,
  }));
}

/** Quick in-stock / sold-out switch from the menu list. */
export async function setItemAvailable(input: unknown) {
  return mutate("food.write", itemAvailabilitySchema, input, async ({ id, is_available }, supabase) => {
    const { data, error } = await supabase
      .from("store_items")
      .update({ is_available })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

/** Quick stock count for a tracked item. */
export async function setItemStock(input: unknown) {
  return mutate("food.write", itemStockSchema, input, async ({ id, stock }, supabase) => {
    const { data, error } = await supabase
      .from("store_items")
      .update({ stock })
      .eq("id", id)
      .eq("track_stock", true)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

export async function saveVariant(input: unknown) {
  return mutate("food.write", variantFormSchema, input, async (form, supabase) => {
    const row = variantRow(form);
    const { data, error } = form.id
      ? await supabase.from("item_variants").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("item_variants").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteVariant(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("item_variants").delete().eq("id", id)).error,
  }));
}

export async function saveAddonGroup(input: unknown) {
  return mutate("food.write", addonGroupFormSchema, input, async (form, supabase) => {
    const row = addonGroupRow(form);
    const { data, error } = form.id
      ? await supabase.from("item_addon_groups").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("item_addon_groups").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Its add-ons go with it. */
export async function deleteAddonGroup(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("item_addon_groups").delete().eq("id", id)).error,
  }));
}

export async function saveAddon(input: unknown) {
  return mutate("food.write", addonFormSchema, input, async (form, supabase) => {
    const row = addonRow(form);
    const { data, error } = form.id
      ? await supabase.from("item_addons").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("item_addons").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteAddon(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("item_addons").delete().eq("id", id)).error,
  }));
}

// ---------------------------------------------------------------- zones and riders

export async function saveDeliveryZone(input: unknown) {
  return mutate("food.write", deliveryZoneFormSchema, input, async (form, supabase) => {
    const row = deliveryZoneRow(form);
    const { data, error } = form.id
      ? await supabase.from("delivery_zones").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("delivery_zones").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** A zone with orders or prescriptions cannot be deleted (switch it off); store links go with it. */
export async function deleteDeliveryZone(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

export async function saveRider(input: unknown) {
  return mutate("food.write", riderFormSchema, input, async (form, supabase) => {
    const row = riderRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("delivery_partners")
          .update(row)
          .eq("id", form.id)
          .is("deleted_at", null)
          .select("id")
          .single()
      : await supabase.from("delivery_partners").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Soft delete: past orders keep the rider's name and phone; they leave every list and dialog. */
export async function deleteRider(input: unknown) {
  return mutate("food.write", deliveryIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("delivery_partners")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? {} : { error: notFound };
  });
}

// ---------------------------------------------------------------- dispatch

export type DeliveryActionResult = MutationResult | { ok: true; url: string };

type OrderRef = { id: string; kind: StoreKind; vendor_id: string };

/**
 * Shape of every dispatch action: signed in, valid input, then the
 * permission for the order's kind (food.* or medicine.*) before `fn` runs.
 */
async function orderAction<S extends z.ZodType<{ orderId: string }>>(
  access: "read" | "write",
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, session: SessionContext, order: OrderRef) => Promise<DeliveryActionResult>,
): Promise<DeliveryActionResult> {
  if (!(await getSession())) return { ok: false, error: "forbidden" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  const { data: order, error } = await createAdminClient()
    .from("orders")
    .select("id, kind, vendor_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (error) return failure("order", error);
  if (!order) return { ok: false, error: "notFound" };
  let session: SessionContext;
  try {
    session = await assertPermission(kindPermission(order.kind, access));
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw e;
  }
  return fn(parsed.data, session, order);
}

function failure(scope: string, error: unknown): DeliveryActionResult {
  const code =
    error instanceof BookingError ? error.code : error instanceof Error ? error.message : String(error);
  const key = deliveryErrorKey(code);
  if (key === "actionFailed") console.error(`[delivery admin] ${scope}`, error);
  return { ok: false, error: key };
}

/** Moves an order one step on behalf of the store or rider; staff skip the delivery OTP. Rejecting refunds. */
export async function moveOrderAction(input: unknown): Promise<DeliveryActionResult> {
  return orderAction("write", orderMoveSchema, input, async (data, session) => {
    try {
      await moveOrder({
        orderId: data.orderId,
        status: data.status,
        actor: session.user.id,
        source: "admin",
        note: data.note || null,
      });
    } catch (error) {
      return failure("move", error);
    } finally {
      revalidatePath("/[locale]/admin", "layout");
    }
    return { ok: true };
  });
}

/** Assigns or replaces the rider; the previous rider link stops working. */
export async function assignRiderAction(input: unknown): Promise<DeliveryActionResult> {
  return orderAction("write", orderAssignSchema, input, async (data, session) => {
    try {
      await assignRider(data.orderId, data.partnerId, session.user.id);
    } catch (error) {
      return failure("assign", error);
    } finally {
      revalidatePath("/[locale]/admin", "layout");
    }
    return { ok: true };
  });
}

/** The current rider link of one order (token read with the service role, for food.read / medicine.read staff). */
export async function riderLinkAction(input: unknown): Promise<DeliveryActionResult> {
  return orderAction("read", orderRefSchema, input, async ({ orderId }) => {
    const { data, error } = await createAdminClient()
      .from("orders")
      .select("partner_token, partner_token_expires_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return failure("rider link", error);
    if (!data?.partner_token) return { ok: false, error: "noRiderLink" };
    if (data.partner_token_expires_at && Date.parse(data.partner_token_expires_at) < Date.now()) {
      return { ok: false, error: "riderLinkExpired" };
    }
    return { ok: true, url: riderLink(data.partner_token) };
  });
}

// ---------------------------------------------------------------- prescriptions and quotes

/** Picks up a new prescription so others see someone is on it. */
export async function markPrescriptionReviewing(input: unknown) {
  return mutate("medicine.write", deliveryIdSchema, input, async ({ id }, supabase) => {
    const session = await getSession();
    const { data, error } = await supabase
      .from("prescriptions")
      .update({ status: "reviewing", reviewed_by: session?.user.id ?? null })
      .eq("id", id)
      .eq("status", "submitted")
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

/** The partner pharmacy that will fill it (or none). */
export async function assignPrescriptionPharmacy(input: unknown) {
  return mutate("medicine.write", prescriptionAssignSchema, input, async ({ id, store_id }, supabase) => {
    if (store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("id", store_id)
        .eq("kind", "pharmacy")
        .is("deleted_at", null)
        .maybeSingle();
      if (!store) return { error: notFound };
    }
    const { data, error } = await supabase
      .from("prescriptions")
      .update({ store_id })
      .eq("id", id)
      .neq("status", "ordered")
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

/** Rejects a prescription with a reason the customer is told; any live quote is withdrawn. */
export async function rejectPrescription(input: unknown) {
  return mutate("medicine.write", prescriptionRejectSchema, input, async ({ id, reason }, supabase) => {
    const session = await getSession();
    const { data, error } = await supabase
      .from("prescriptions")
      .update({ status: "rejected", review_note: reason, reviewed_by: session?.user.id ?? null })
      .eq("id", id)
      .neq("status", "ordered")
      .select("*")
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: notFound };
    const withdrawn = await supabase
      .from("medicine_quotes")
      .update({ status: "withdrawn" })
      .eq("prescription_id", id)
      .eq("status", "sent");
    if (withdrawn.error) return { error: withdrawn.error };

    // A failed message never undoes the rejection.
    const contact = await patientContact(data.user_id).catch(() => null);
    const locale = contact?.preferred_locale ?? "en";
    const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    await notify({
      key: "medicine.rejected",
      locale,
      to: { email: contact?.email ?? null, phone: data.phone, userId: data.user_id },
      values: {
        name: data.patient_name,
        reason,
        upload_url: `${site}${locale === "hi" ? "/hi" : ""}/medicine`,
      },
    });
    return { id };
  });
}

/**
 * Sends a quote: withdraws the live one (one per prescription), inserts the
 * new one valid for `delivery.defaults.quote_valid_hours`, marks the
 * prescription quoted with that pharmacy, and tells the customer.
 */
export async function sendMedicineQuote(input: unknown) {
  return mutate("medicine.write", quoteFormSchema, input, async (form, supabase) => {
    const lines = quoteLinesSchema.safeParse(quoteFormLines(form));
    if (!lines.success) return { error: invalidContent };
    const [session, settings] = await Promise.all([getSession(), getDeliverySettings()]);

    const { data: prescription, error: readError } = await supabase
      .from("prescriptions")
      .select("*")
      .eq("id", form.prescription_id)
      .maybeSingle();
    if (readError) return { error: readError };
    if (!prescription || prescription.status === "ordered" || prescription.status === "rejected") {
      return { error: notFound };
    }
    const { data: store } = await supabase
      .from("stores")
      .select("id, name")
      .eq("id", form.store_id)
      .eq("kind", "pharmacy")
      .is("deleted_at", null)
      .maybeSingle();
    if (!store) return { error: notFound };

    const withdrawn = await supabase
      .from("medicine_quotes")
      .update({ status: "withdrawn" })
      .eq("prescription_id", prescription.id)
      .eq("status", "sent");
    if (withdrawn.error) return { error: withdrawn.error };

    const validUntil = quoteValidUntil(settings.quote_valid_hours);
    const { data: quote, error } = await supabase
      .from("medicine_quotes")
      .insert({
        prescription_id: prescription.id,
        store_id: store.id,
        lines: lines.data as unknown as Json,
        delivery_fee_paise: form.delivery_fee,
        note: form.note,
        valid_until: validUntil,
        status: "sent",
        created_by: session?.user.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { error };
    const updated = await supabase
      .from("prescriptions")
      .update({ status: "quoted", store_id: store.id, reviewed_by: session?.user.id ?? null })
      .eq("id", prescription.id);
    if (updated.error) return { error: updated.error };

    // The total the customer will see for cash on delivery (no online fee).
    const price = finalizePrice(buildQuoteLines(lines.data, form.delivery_fee, settings, null), 0, []);
    const contact = await patientContact(prescription.user_id).catch(() => null);
    const locale = contact?.preferred_locale ?? "en";
    await notify({
      key: "medicine.quoted",
      locale,
      to: { email: contact?.email ?? null, phone: prescription.phone, userId: prescription.user_id },
      values: {
        name: prescription.patient_name,
        store: pickLocalized(store.name, locale),
        total: formatPaise(price.totalPaise, locale),
        items: lines.data.map((l) => `${l.qty} × ${l.name}`).join(", "),
        valid_until: new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(validUntil)),
        quote_url: prescriptionUrl(publicEnv().NEXT_PUBLIC_SITE_URL, locale, prescription.id),
      },
    });
    return { id: quote.id };
  });
}

/** Withdraws the live quote (the prescription goes back to reviewing). */
export async function withdrawMedicineQuote(input: unknown) {
  return mutate("medicine.write", deliveryIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("medicine_quotes")
      .update({ status: "withdrawn" })
      .eq("id", id)
      .eq("status", "sent")
      .select("prescription_id")
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: notFound };
    const { error: e } = await supabase
      .from("prescriptions")
      .update({ status: "reviewing" })
      .eq("id", data.prescription_id)
      .eq("status", "quoted");
    return { id, error: e };
  });
}

// ---------------------------------------------------------------- settings

export async function saveDeliverySettings(input: unknown) {
  return mutate("settings.write", deliverySettingsFormSchema, input, async (form, supabase) => {
    const value = deliverySettingsSchema.safeParse(deliverySettingsValue(form));
    if (!value.success) return { error: invalidContent };
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "delivery.defaults")
      .maybeSingle();
    if (error) return { error };
    return {
      error: (
        await supabase.from("settings").upsert({
          key: "delivery.defaults",
          value: mergeSettingValue(data?.value, value.data as { [key: string]: Json | undefined }),
          // Public: checkout shows the COD limit and the medicine notice.
          is_public: true,
        })
      ).error,
    };
  });
}
