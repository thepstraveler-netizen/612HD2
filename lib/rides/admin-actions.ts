"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { mutate, type MutationResult } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { publicEnv } from "@/lib/env";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignRideSchema,
  pointFormSchema,
  rideFaresFormSchema,
  rideIdSchema,
  rideRefSchema,
  rideSettingsFormSchema,
  rideStepSchema,
  rideVehicleFormSchema,
  vehicleTypeFormSchema,
  zoneFormSchema,
} from "@/schemas/ride-admin";
import { rideSettingsSchema } from "@/schemas/rides";
import type { Json } from "@/types/database";
import {
  driverRideUrl,
  pointRow,
  rideErrorKey,
  rideFareOffered,
  rideFareRuleRow,
  rideSettingsValue,
  rideVehicleRow,
  vehicleTypeRow,
  zoneRow,
} from "./admin-rows";
import { notifyRideAssigned } from "./service";

/**
 * Rides admin mutations.
 *
 * Catalog, fleet and settings writes go through {@link mutate}: rides.write
 * (settings.write for Settings → Rides), zod, an RLS write as the staff
 * user, audited by the table triggers.
 *
 * Dispatch (assign, status steps) calls the service-role-only SQL functions
 * after checking rides.write here, passing the staff user as `p_actor` so
 * the ride events and the audit log record who did it. The driver link
 * token is read the same way, one ride at a time, for rides.read staff.
 */

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

// ---------------------------------------------------------------- vehicle types

export async function saveVehicleType(input: unknown) {
  return mutate("rides.write", vehicleTypeFormSchema, input, async (form, supabase) => {
    const row = vehicleTypeRow(form);
    const { data, error } = form.id
      ? await supabase.from("ride_vehicle_types").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("ride_vehicle_types").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** A type with rides or vehicles cannot be deleted (switch it off); its fares go with it. */
export async function deleteVehicleType(input: unknown) {
  return mutate("rides.write", rideIdSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("ride_vehicle_types").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

// ---------------------------------------------------------------- zones and landmarks

export async function saveZone(input: unknown) {
  return mutate("rides.write", zoneFormSchema, input, async (form, supabase) => {
    const row = zoneRow(form);
    const { data, error } = form.id
      ? await supabase.from("ride_zones").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("ride_zones").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

/** A zone with rides cannot be deleted; its landmarks and fares go with it. */
export async function deleteZone(input: unknown) {
  return mutate("rides.write", rideIdSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("ride_zones").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

export async function savePoint(input: unknown) {
  return mutate("rides.write", pointFormSchema, input, async (form, supabase) => {
    const row = pointRow(form);
    const { data, error } = form.id
      ? await supabase.from("ride_points").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("ride_points").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Rides keep their own address (pickup_point_id is set null). */
export async function deletePoint(input: unknown) {
  return mutate("rides.write", rideIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("ride_points").delete().eq("id", id)).error,
  }));
}

// ---------------------------------------------------------------- fare grid

/** Saves one zone's grid: offered cells are upserted, empty cells removed. */
export async function saveRideFares(input: unknown) {
  return mutate("rides.write", rideFaresFormSchema, input, async ({ zone_id, rules }, supabase) => {
    const offered = rules.filter(rideFareOffered);
    const cleared = rules.filter((r) => !rideFareOffered(r));
    if (offered.length) {
      const { error } = await supabase.from("ride_fare_rules").upsert(
        offered.map((r) => rideFareRuleRow(zone_id, r)),
        { onConflict: "zone_id,vehicle_type_id,mode" },
      );
      if (error) return { error: error.code === FK_VIOLATION ? notFound : error };
    }
    for (const r of cleared) {
      const { error } = await supabase
        .from("ride_fare_rules")
        .delete()
        .eq("zone_id", zone_id)
        .eq("vehicle_type_id", r.vehicle_type_id)
        .eq("mode", r.mode);
      if (error) return { error };
    }
    return { id: zone_id };
  });
}

// ---------------------------------------------------------------- ride vehicles

export async function saveRideVehicle(input: unknown) {
  return mutate("rides.write", rideVehicleFormSchema, input, async (form, supabase) => {
    const row = rideVehicleRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("vehicles")
          .update(row)
          .eq("id", form.id)
          .not("ride_vehicle_type_id", "is", null)
          .is("deleted_at", null)
          .select("id")
          .single()
      : await supabase.from("vehicles").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Soft delete: past rides keep their copy of the vehicle; it leaves every list and dialog. */
export async function deleteRideVehicle(input: unknown) {
  return mutate("rides.write", rideIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("vehicles")
      .update({ deleted_at: new Date().toISOString(), is_active: false, default_driver_id: null })
      .eq("id", id)
      .not("ride_vehicle_type_id", "is", null)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? {} : { error: notFound };
  });
}

// ---------------------------------------------------------------- dispatch

export type RideActionResult = MutationResult | { ok: true; url: string };

async function rideAction<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, session: SessionContext) => Promise<RideActionResult>,
): Promise<RideActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  return fn(parsed.data, session);
}

function rpcFailure(scope: string, error: { message: string }): RideActionResult {
  const key = rideErrorKey(error.message);
  if (key === "actionFailed") console.error(`[rides admin] ${scope}`, error);
  return { ok: false, error: key };
}

/** Assigns or replaces the driver (and optional ride vehicle); the previous driver link stops working. */
export async function assignRideAction(input: unknown): Promise<RideActionResult> {
  return rideAction("rides.write", assignRideSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("assign_ride", {
      p_ride_id: data.rideId,
      p_driver_id: data.driverId,
      p_vehicle_id: data.vehicleId,
      p_actor: session.user.id,
    });
    revalidatePath("/[locale]/admin", "layout");
    if (error) return rpcFailure("assign", error);
    // A failed message never undoes the assignment.
    await notifyRideAssigned(data.rideId).catch((e: unknown) => console.error("[rides admin] notify", e));
    return { ok: true };
  });
}

/** Moves a ride one step on behalf of the driver; staff skip the pickup OTP. */
export async function setRideStatusAction(input: unknown): Promise<RideActionResult> {
  return rideAction("rides.write", rideStepSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("set_ride_status", {
      p_ride_id: data.rideId,
      p_status: data.status,
      p_actor: session.user.id,
      p_source: "admin",
      p_note: data.note ?? null,
      p_otp: null,
    });
    revalidatePath("/[locale]/admin", "layout");
    return error ? rpcFailure("status", error) : { ok: true };
  });
}

/** The current driver link of one ride (token read with the service role, for rides.read staff). */
export async function rideDriverLinkAction(input: unknown): Promise<RideActionResult> {
  return rideAction("rides.read", rideRefSchema, input, async ({ rideId }) => {
    const { data, error } = await createAdminClient()
      .from("ride_requests")
      .select("driver_token, driver_token_expires_at")
      .eq("id", rideId)
      .maybeSingle();
    if (error) return rpcFailure("driver link", error);
    if (!data?.driver_token) return { ok: false, error: "noDriverLink" };
    if (data.driver_token_expires_at && Date.parse(data.driver_token_expires_at) < Date.now()) {
      return { ok: false, error: "driverLinkExpired" };
    }
    return { ok: true, url: driverRideUrl(publicEnv().NEXT_PUBLIC_SITE_URL, data.driver_token) };
  });
}

// ---------------------------------------------------------------- settings

export async function saveRideSettings(input: unknown) {
  return mutate("settings.write", rideSettingsFormSchema, input, async (form, supabase) => {
    const value = rideSettingsSchema.safeParse(rideSettingsValue(form));
    if (!value.success) return { error: { message: "invalid", code: "invalidContent" } };
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "rides.defaults")
      .maybeSingle();
    if (error) return { error };
    return {
      error: (
        await supabase.from("settings").upsert({
          key: "rides.defaults",
          value: mergeSettingValue(data?.value, value.data as { [key: string]: Json | undefined }),
          is_public: false,
        })
      ).error,
    };
  });
}
