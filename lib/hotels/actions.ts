"use server";

import { mutate } from "@/lib/admin/mutate";
import { hotelRow, pricingRuleRow, ratePlanRow } from "@/lib/hotels/admin-rows";
import { changesInventory, planCalendarEdit, type ExistingInventory } from "@/lib/hotels/calendar-edit";
import { mediaRegisterSchema } from "@/schemas/cms";
import {
  calendarEditSchema,
  hotelDeleteSchema,
  hotelFormSchema,
  hotelMediaSchema,
  pricingRuleFormSchema,
  roomFormSchema,
} from "@/schemas/hotels";

/** Hotel admin mutations; each goes through {@link mutate} (permission, zod, RLS, audit, revalidate). */

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

// ------------------------------------------------------------- hotels

export async function saveHotel(input: unknown) {
  return mutate("hotels.write", hotelFormSchema, input, async (form, supabase) => {
    const row = hotelRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("hotels")
          .update(row)
          .eq("id", form.id)
          .is("deleted_at", null)
          .select("id")
          .single()
      : await supabase.from("hotels").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    const id = data.id;

    const { data: current, error: readError } = await supabase
      .from("hotel_amenities")
      .select("amenity_id")
      .eq("hotel_id", id);
    if (readError) return { id, error: readError };
    const wanted = new Set(form.amenity_ids);
    const have = new Set(current.map((a) => a.amenity_id));
    const removed = [...have].filter((a) => !wanted.has(a));
    const added = [...wanted].filter((a) => !have.has(a));
    if (removed.length) {
      const { error } = await supabase
        .from("hotel_amenities")
        .delete()
        .eq("hotel_id", id)
        .in("amenity_id", removed);
      if (error) return { id, error };
    }
    if (added.length) {
      const { error } = await supabase
        .from("hotel_amenities")
        .insert(added.map((amenity_id) => ({ hotel_id: id, amenity_id })));
      if (error) return { id, error };
    }
    return { id };
  });
}

/** Soft delete: the row stays for bookings and the audit trail, hidden everywhere. */
export async function deleteHotel(input: unknown) {
  return mutate("hotels.write", hotelDeleteSchema, input, async ({ id }, supabase) => ({
    error: (
      await supabase
        .from("hotels")
        .update({ deleted_at: new Date().toISOString(), status: "archived" })
        .eq("id", id)
    ).error,
  }));
}

// ------------------------------------------------------------- photos

export async function registerHotelMedia(input: unknown) {
  return mutate("hotels.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

/** Replaces the gallery: listed photos in this order, everything else detached. */
export async function saveHotelMedia(input: unknown) {
  return mutate("hotels.write", hotelMediaSchema, input, async ({ hotel_id, media_ids }, supabase) => {
    const ids = [...new Set(media_ids)];
    const { data: current, error: readError } = await supabase
      .from("hotel_media")
      .select("media_id, room_id")
      .eq("hotel_id", hotel_id);
    if (readError) return { error: readError };
    const removed = current.map((m) => m.media_id).filter((m) => !ids.includes(m));
    if (removed.length) {
      const { error } = await supabase
        .from("hotel_media")
        .delete()
        .eq("hotel_id", hotel_id)
        .in("media_id", removed);
      if (error) return { error };
    }
    if (ids.length) {
      const roomOf = new Map(current.map((m) => [m.media_id, m.room_id]));
      const { error } = await supabase.from("hotel_media").upsert(
        ids.map((media_id, index) => ({
          hotel_id,
          media_id,
          room_id: roomOf.get(media_id) ?? null,
          sort_order: index,
        })),
        { onConflict: "hotel_id,media_id" },
      );
      if (error) return { error };
    }
    return { id: hotel_id };
  });
}

// ------------------------------------------------------------- rooms

export async function saveRoom(input: unknown) {
  return mutate("hotels.write", roomFormSchema, input, async ({ id, plans, ...form }, supabase) => {
    const row = { ...form, bed_type: form.bed_type || null };
    const { data, error } = id
      ? await supabase
          .from("hotel_rooms")
          .update(row)
          .eq("id", id)
          .eq("hotel_id", form.hotel_id)
          .select("id")
          .single()
      : await supabase.from("hotel_rooms").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    const roomId = data.id;

    const { data: current, error: readError } = await supabase
      .from("hotel_rate_plans")
      .select("id")
      .eq("room_id", roomId);
    if (readError) return { id: roomId, error: readError };
    const existing = new Set(current.map((p) => p.id));
    if (plans.some((p) => p.id && !existing.has(p.id))) return { id: roomId, error: notFound };

    const kept = new Set(plans.map((p) => p.id).filter(Boolean));
    const removed = [...existing].filter((p) => !kept.has(p));
    if (removed.length) {
      const { error } = await supabase.from("hotel_rate_plans").delete().in("id", removed);
      if (error) return { id: roomId, error: error.code === FK_VIOLATION ? inUse : error };
    }

    const rows = plans.map((plan, index) => ({ id: plan.id, row: ratePlanRow(plan, roomId, index) }));
    const updates = rows.flatMap(({ id, row }) => (id ? [{ id, ...row }] : []));
    const inserts = rows.flatMap(({ id, row }) => (id ? [] : [row]));
    if (updates.length) {
      const { error } = await supabase.from("hotel_rate_plans").upsert(updates, { onConflict: "id" });
      if (error) return { id: roomId, error };
    }
    if (inserts.length) {
      const { error } = await supabase.from("hotel_rate_plans").insert(inserts);
      if (error) return { id: roomId, error };
    }
    return { id: roomId };
  });
}

export async function deleteRoom(input: unknown) {
  return mutate("hotels.write", hotelDeleteSchema, input, async ({ id }, supabase) => {
    const { error } = await supabase.from("hotel_rooms").delete().eq("id", id);
    return { error: error?.code === FK_VIOLATION ? inUse : error };
  });
}

// ------------------------------------------------------------- calendar

export async function applyCalendarEdit(input: unknown) {
  return mutate("hotels.write", calendarEditSchema, input, async (edit, supabase) => {
    const { data: room, error: roomError } = await supabase
      .from("hotel_rooms")
      .select("id")
      .eq("id", edit.room_id)
      .eq("hotel_id", edit.hotel_id)
      .maybeSingle();
    if (roomError) return { error: roomError };
    if (!room) return { error: notFound };
    if (edit.rate_plan_id) {
      const { data: plan, error } = await supabase
        .from("hotel_rate_plans")
        .select("id")
        .eq("id", edit.rate_plan_id)
        .eq("room_id", edit.room_id)
        .maybeSingle();
      if (error) return { error };
      if (!plan) return { error: notFound };
    }

    let existing: ExistingInventory[] = [];
    if (changesInventory(edit)) {
      const { data, error } = await supabase
        .from("hotel_inventory")
        .select("date, units, is_closed, min_stay")
        .eq("room_id", edit.room_id)
        .gte("date", edit.start)
        .lte("date", edit.end);
      if (error) return { error };
      existing = data;
    }

    const plan = planCalendarEdit(edit, existing);
    if (plan.inventory.length) {
      const { error } = await supabase
        .from("hotel_inventory")
        .upsert(plan.inventory, { onConflict: "room_id,date" });
      if (error) return { error };
    }
    if (plan.rates.length) {
      const { error } = await supabase
        .from("hotel_rates")
        .upsert(plan.rates, { onConflict: "rate_plan_id,date" });
      if (error) return { error };
    }
    if (plan.clearRates) {
      const { error } = await supabase
        .from("hotel_rates")
        .delete()
        .eq("rate_plan_id", plan.clearRates.rate_plan_id)
        .in("date", plan.clearRates.dates);
      if (error) return { error };
    }
    return { id: edit.room_id };
  });
}

// ------------------------------------------------------------- pricing rules

export async function savePricingRule(input: unknown) {
  return mutate("hotels.write", pricingRuleFormSchema, input, async ({ id, ...form }, supabase) => {
    // A scoped rule must point at this hotel's room / plan (and the plan at that room).
    let roomId = form.room_id;
    if (form.rate_plan_id) {
      const { data: plan, error } = await supabase
        .from("hotel_rate_plans")
        .select("room_id")
        .eq("id", form.rate_plan_id)
        .maybeSingle();
      if (error) return { error };
      if (!plan || (roomId && plan.room_id !== roomId)) return { error: notFound };
      roomId = plan.room_id;
    }
    if (roomId) {
      const { data: room, error } = await supabase
        .from("hotel_rooms")
        .select("id")
        .eq("id", roomId)
        .eq("hotel_id", form.hotel_id)
        .maybeSingle();
      if (error) return { error };
      if (!room) return { error: notFound };
    }

    const row = pricingRuleRow(form);
    const { data, error } = id
      ? await supabase
          .from("hotel_pricing_rules")
          .update(row)
          .eq("id", id)
          .eq("hotel_id", form.hotel_id)
          .select("id")
          .single()
      : await supabase.from("hotel_pricing_rules").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS ? notFound : error };
    return { id: data.id };
  });
}

export async function deletePricingRule(input: unknown) {
  return mutate("hotels.write", hotelDeleteSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("hotel_pricing_rules").delete().eq("id", id)).error,
  }));
}
