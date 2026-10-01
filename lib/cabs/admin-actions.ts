"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { mutate, type MutationResult, type Supabase } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTripAssigned } from "./service";
import { createClient } from "@/lib/supabase/server";
import { cabSettingsSchema } from "@/schemas/cabs";
import { mediaRegisterSchema } from "@/schemas/cms";
import {
  addonFormSchema,
  assignTripSchema,
  cabIdSchema,
  cabSettingsFormSchema,
  categoryFormSchema,
  driverFormSchema,
  fareRulesFormSchema,
  fleetDocumentSchema,
  fleetUploadSchema,
  packageFormSchema,
  placeFormSchema,
  routeFaresFormSchema,
  routeFormSchema,
  surchargeFormSchema,
  tripIdSchema,
  tripStepSchema,
  vehicleFormSchema,
} from "@/schemas/cab-admin";
import type { Json } from "@/types/database";
import {
  addonRow,
  cabSettingsValue,
  categoryRow,
  documentExtension,
  driverRow,
  driverTripUrl,
  fareRuleRow,
  modelRow,
  paperColumn,
  placeRow,
  routeRow,
  surchargeRow,
  tripErrorKey,
  vehicleRow,
} from "./admin-rows";

/**
 * Cabs admin mutations.
 *
 * Catalog, fleet and settings writes go through {@link mutate}: cabs.write
 * (settings.write for Settings → Cabs), zod, an RLS write as the staff
 * user, audited by the table triggers.
 *
 * Dispatch (assign, status steps) calls the service-role-only SQL
 * functions after checking cabs.write here, passing the staff user as
 * `p_actor` so the trip events and the audit log record who did it. The
 * driver link token is read the same way and only by cabs.write staff.
 */

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

// ---------------------------------------------------------------- places

export async function savePlace(input: unknown) {
  return mutate("cabs.write", placeFormSchema, input, async (form, supabase) => {
    const row = placeRow(form);
    const { data, error } = form.id
      ? await supabase.from("cab_places").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("cab_places").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** Places used by a route or a trip cannot be deleted; switch them off instead. */
export async function deletePlace(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("cab_places").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

// ---------------------------------------------------------------- categories and models

export async function registerCabMedia(input: unknown) {
  return mutate("cabs.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function saveCategory(input: unknown) {
  return mutate("cabs.write", categoryFormSchema, input, async ({ models, ...form }, supabase) => {
    const row = categoryRow({ ...form, models });
    const { data, error } = form.id
      ? await supabase.from("cab_categories").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("cab_categories").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    const categoryId = data.id;

    const { data: current, error: readError } = await supabase
      .from("cab_models")
      .select("id")
      .eq("category_id", categoryId);
    if (readError) return { id: categoryId, error: readError };
    const existing = new Set(current.map((m) => m.id));
    if (models.some((m) => m.id && !existing.has(m.id))) return { id: categoryId, error: notFound };

    // Vehicles of a removed model keep their category (model_id is set null).
    const kept = new Set(models.map((m) => m.id).filter(Boolean));
    const removed = [...existing].filter((m) => !kept.has(m));
    if (removed.length) {
      const { error } = await supabase.from("cab_models").delete().in("id", removed);
      if (error) return { id: categoryId, error };
    }
    const rows = models.map((m, index) => ({ id: m.id, row: modelRow(m, categoryId, index) }));
    const updates = rows.flatMap(({ id, row }) => (id ? [{ id, ...row }] : []));
    const inserts = rows.flatMap(({ id, row }) => (id ? [] : [row]));
    if (updates.length) {
      const { error } = await supabase.from("cab_models").upsert(updates, { onConflict: "id" });
      if (error) return { id: categoryId, error };
    }
    if (inserts.length) {
      const { error } = await supabase.from("cab_models").insert(inserts);
      if (error) return { id: categoryId, error };
    }
    return { id: categoryId };
  });
}

/** A category with vehicles or trips cannot be deleted; its fares and models go with it. */
export async function deleteCategory(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("cab_categories").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

// ---------------------------------------------------------------- fare rules

/** Saves the whole grid: filled cells are upserted, cleared cells removed. */
export async function saveFareRules(input: unknown) {
  return mutate("cabs.write", fareRulesFormSchema, input, async ({ rules }, supabase) => {
    const filled = rules.flatMap((r) => (r.rate_per_km !== null && r.rate_per_km > 0 ? [r] : []));
    const cleared = rules.filter((r) => r.rate_per_km === null);
    if (filled.length) {
      const { error } = await supabase.from("cab_fare_rules").upsert(
        filled.map((r) => fareRuleRow({ ...r, rate_per_km: r.rate_per_km ?? 0 })),
        { onConflict: "category_id,trip_type" },
      );
      if (error) return { error };
    }
    for (const r of cleared) {
      const { error } = await supabase
        .from("cab_fare_rules")
        .delete()
        .eq("category_id", r.category_id)
        .eq("trip_type", r.trip_type);
      if (error) return { error };
    }
    return {};
  });
}

// ---------------------------------------------------------------- routes

export async function saveRoute(input: unknown) {
  return mutate("cabs.write", routeFormSchema, input, async (form, supabase) => {
    const row = routeRow(form);
    const { data, error } = form.id
      ? await supabase.from("cab_routes").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("cab_routes").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** Trips keep their own copy of the route (route_id is set null). */
export async function deleteRoute(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("cab_routes").delete().eq("id", id)).error,
  }));
}

export async function saveRouteFares(input: unknown) {
  return mutate("cabs.write", routeFaresFormSchema, input, async ({ route_id, fares }, supabase) => {
    const filled = fares.flatMap((f) => (f.fare !== null ? [{ ...f, fare: f.fare }] : []));
    const cleared = fares.filter((f) => f.fare === null).map((f) => f.category_id);
    if (filled.length) {
      const { error } = await supabase.from("cab_route_fares").upsert(
        filled.map((f) => ({
          route_id,
          category_id: f.category_id,
          fare_paise: f.fare,
          extra_km_paise: f.extra_km,
          tolls_included: f.tolls_included,
        })),
        { onConflict: "route_id,category_id" },
      );
      if (error) return { error: error.code === FK_VIOLATION ? notFound : error };
    }
    if (cleared.length) {
      const { error } = await supabase
        .from("cab_route_fares")
        .delete()
        .eq("route_id", route_id)
        .in("category_id", cleared);
      if (error) return { error };
    }
    return { id: route_id };
  });
}

// ---------------------------------------------------------------- local packages

export async function savePackage(input: unknown) {
  return mutate("cabs.write", packageFormSchema, input, async ({ id, fares, ...form }, supabase) => {
    const row = {
      key: form.key,
      name: form.name,
      hours: form.hours,
      km: form.km,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };
    const { data, error } = id
      ? await supabase.from("cab_local_packages").update(row).eq("id", id).select("id").single()
      : await supabase.from("cab_local_packages").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    const packageId = data.id;

    const filled = fares.flatMap((f) => (f.fare !== null ? [{ ...f, fare: f.fare }] : []));
    const cleared = fares.filter((f) => f.fare === null).map((f) => f.category_id);
    if (filled.length) {
      const { error } = await supabase.from("cab_local_fares").upsert(
        filled.map((f) => ({
          package_id: packageId,
          category_id: f.category_id,
          fare_paise: f.fare,
          extra_km_paise: f.extra_km,
          extra_hour_paise: f.extra_hour,
        })),
        { onConflict: "package_id,category_id" },
      );
      if (error) return { id: packageId, error };
    }
    if (cleared.length) {
      const { error } = await supabase
        .from("cab_local_fares")
        .delete()
        .eq("package_id", packageId)
        .in("category_id", cleared);
      if (error) return { id: packageId, error };
    }
    return { id: packageId };
  });
}

export async function deletePackage(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("cab_local_packages").delete().eq("id", id)).error,
  }));
}

// ---------------------------------------------------------------- add-ons and peak pricing

export async function saveAddon(input: unknown) {
  return mutate("cabs.write", addonFormSchema, input, async (form, supabase) => {
    const row = addonRow(form);
    const { data, error } = form.id
      ? await supabase.from("cab_addons").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("cab_addons").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteAddon(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("cab_addons").delete().eq("id", id)).error,
  }));
}

export async function saveSurcharge(input: unknown) {
  return mutate("cabs.write", surchargeFormSchema, input, async (form, supabase) => {
    const row = surchargeRow(form);
    const { data, error } = form.id
      ? await supabase.from("cab_surcharges").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("cab_surcharges").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteSurcharge(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("cab_surcharges").delete().eq("id", id)).error,
  }));
}

// ---------------------------------------------------------------- drivers and vehicles

/**
 * Saves a driver. An optional login email is resolved to an existing
 * account (profiles, read with the service role after the permission
 * check, so the lookup cannot be used to probe emails).
 */
export async function saveDriver(input: unknown): Promise<MutationResult> {
  try {
    await assertPermission("cabs.write");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const email = driverFormSchema.shape.login_email.safeParse(
    (input as { login_email?: unknown } | null)?.login_email ?? "",
  );
  let userId: string | null = null;
  if (email.success && email.data) {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("email", email.data)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[cabs admin] driver login lookup", error);
      return { ok: false, error: "saveFailed" };
    }
    if (!data) return { ok: false, error: "emailNotFound" };
    userId = data.id;
  }
  return mutate("cabs.write", driverFormSchema, input, async (form, supabase) => {
    const row = driverRow(form, userId);
    const { data, error } = form.id
      ? await supabase
          .from("drivers")
          .update(row)
          .eq("id", form.id)
          .is("deleted_at", null)
          .select("id")
          .single()
      : await supabase.from("drivers").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** Soft delete: past trips keep pointing at the driver; they leave every list and dialog. */
export async function deleteDriver(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (
      await supabase
        .from("drivers")
        .update({ deleted_at: new Date().toISOString(), is_active: false, user_id: null })
        .eq("id", id)
    ).error,
  }));
}

export async function saveVehicle(input: unknown) {
  return mutate("cabs.write", vehicleFormSchema, input, async (form, supabase) => {
    // The model must belong to the chosen category.
    if (form.model_id) {
      const { data: model, error } = await supabase
        .from("cab_models")
        .select("category_id")
        .eq("id", form.model_id)
        .maybeSingle();
      if (error) return { error };
      if (!model || model.category_id !== form.category_id) return { error: notFound };
    }
    const row = vehicleRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("vehicles")
          .update(row)
          .eq("id", form.id)
          .is("deleted_at", null)
          .select("id")
          .single()
      : await supabase.from("vehicles").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteVehicle(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => ({
    error: (
      await supabase
        .from("vehicles")
        .update({ deleted_at: new Date().toISOString(), is_active: false, default_driver_id: null })
        .eq("id", id)
    ).error,
  }));
}

// ---------------------------------------------------------------- fleet documents

/** Checks the driver / vehicle exists (as the staff user, so RLS applies too). */
async function fleetOwnerExists(supabase: Supabase, ownerType: "driver" | "vehicle", ownerId: string) {
  const table = ownerType === "driver" ? "drivers" : "vehicles";
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  return { exists: Boolean(data), error };
}

export type FleetUploadResult = { ok: true; path: string; token: string } | { ok: false; error: string };

/**
 * Step 1 of a document upload: a one-time signed upload URL for a new path
 * under `fleet/<owner>/<id>/` in the private `documents` bucket. The browser
 * uploads straight to Storage (no server body limit), then calls
 * {@link saveFleetDocument}.
 */
export async function createFleetUpload(input: unknown): Promise<FleetUploadResult> {
  try {
    await assertPermission("cabs.write");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = fleetUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "badFile" };
  const { owner_type, owner_id, mime_type } = parsed.data;
  const owner = await fleetOwnerExists(await createClient(), owner_type, owner_id);
  if (owner.error || !owner.exists) return { ok: false, error: "notFound" };
  const path = `fleet/${owner_type}/${owner_id}/${crypto.randomUUID()}.${documentExtension(mime_type)}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUploadUrl(path);
  if (error) {
    console.error("[cabs admin] signed upload", error);
    return { ok: false, error: "uploadFailed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: records the uploaded file; its expiry also updates the matching date on the owner. */
export async function saveFleetDocument(input: unknown) {
  return mutate("cabs.write", fleetDocumentSchema, input, async (doc, supabase) => {
    if (!doc.file_path.startsWith(`fleet/${doc.owner_type}/${doc.owner_id}/`)) return { error: notFound };
    const owner = await fleetOwnerExists(supabase, doc.owner_type, doc.owner_id);
    if (owner.error) return { error: owner.error };
    if (!owner.exists) return { error: notFound };
    const { data: session } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("fleet_documents")
      .insert({ ...doc, uploaded_by: session.user?.id ?? null })
      .select("id")
      .single();
    if (error) return { error };
    const column = paperColumn(doc.owner_type, doc.kind);
    if (column && doc.expires_on) {
      const { error } =
        column === "licence_expiry"
          ? await supabase.from("drivers").update({ licence_expiry: doc.expires_on }).eq("id", doc.owner_id)
          : await supabase
              .from("vehicles")
              .update({ [column]: doc.expires_on } as Partial<Record<typeof column, string>>)
              .eq("id", doc.owner_id);
      if (error) return { id: data.id, error };
    }
    return { id: data.id };
  });
}

export async function deleteFleetDocument(input: unknown) {
  return mutate("cabs.write", cabIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("fleet_documents")
      .delete()
      .eq("id", id)
      .select("file_path")
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: notFound };
    const removed = await createAdminClient().storage.from("documents").remove([data.file_path]);
    // The row is gone either way; a stray file only costs storage.
    if (removed.error) console.error("[cabs admin] document file", removed.error);
    return {};
  });
}

// ---------------------------------------------------------------- dispatch

export type TripActionResult = MutationResult | { ok: true; url: string };

async function tripAction<S extends z.ZodType>(
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, session: SessionContext) => Promise<TripActionResult>,
): Promise<TripActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission("cabs.write");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  const result = await fn(parsed.data, session);
  revalidatePath("/[locale]/admin", "layout");
  return result;
}

function rpcFailure(scope: string, error: { message: string }): TripActionResult {
  const key = tripErrorKey(error.message);
  if (key === "actionFailed") console.error(`[cabs admin] ${scope}`, error);
  return { ok: false, error: key };
}

/** Assigns or replaces the driver and vehicle; the previous driver link stops working. */
export async function assignTripAction(input: unknown): Promise<TripActionResult> {
  return tripAction(assignTripSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("assign_trip", {
      p_trip_id: data.tripId,
      p_driver_id: data.driverId,
      p_vehicle_id: data.vehicleId,
      p_actor: session.user.id,
    });
    if (error) return rpcFailure("assign", error);
    // A failed message never undoes the assignment (D-041).
    await notifyTripAssigned(data.tripId).catch((e: unknown) => console.error("[cabs admin] notify", e));
    return { ok: true };
  });
}

/** Moves a trip one step on behalf of the driver; staff skip the pickup OTP. */
export async function setTripStatusAction(input: unknown): Promise<TripActionResult> {
  return tripAction(tripStepSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("set_trip_status", {
      p_trip_id: data.tripId,
      p_status: data.status,
      p_actor: session.user.id,
      p_source: "admin",
      p_note: data.note ?? null,
      p_otp: null,
    });
    return error ? rpcFailure("status", error) : { ok: true };
  });
}

/** The current driver link (token read with the service role, for cabs.write staff only). */
export async function driverLinkAction(input: unknown): Promise<TripActionResult> {
  return tripAction(tripIdSchema, input, async ({ tripId }) => {
    const { data, error } = await createAdminClient()
      .from("trips")
      .select("driver_token, driver_token_expires_at")
      .eq("id", tripId)
      .maybeSingle();
    if (error) return rpcFailure("driver link", error);
    if (!data?.driver_token) return { ok: false, error: "noDriverLink" };
    if (data.driver_token_expires_at && Date.parse(data.driver_token_expires_at) < Date.now()) {
      return { ok: false, error: "driverLinkExpired" };
    }
    return { ok: true, url: driverTripUrl(publicEnv().NEXT_PUBLIC_SITE_URL, data.driver_token) };
  });
}

// ---------------------------------------------------------------- settings

export async function saveCabSettings(input: unknown) {
  return mutate("settings.write", cabSettingsFormSchema, input, async (form, supabase) => {
    const value = cabSettingsSchema.safeParse(cabSettingsValue(form));
    if (!value.success) return { error: { message: "invalid", code: "invalidContent" } };
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "cabs.defaults")
      .maybeSingle();
    if (error) return { error };
    return {
      error: (
        await supabase.from("settings").upsert({
          key: "cabs.defaults",
          value: mergeSettingValue(data?.value, value.data as { [key: string]: Json | undefined }),
          is_public: false,
        })
      ).error,
    };
  });
}
