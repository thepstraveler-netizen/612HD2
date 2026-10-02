"use server";

import { mutate, type Supabase } from "@/lib/admin/mutate";
import { mergeSettingValue } from "@/lib/bookings/admin-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mediaRegisterSchema } from "@/schemas/cms";
import { leadsSettingsSchema } from "@/schemas/leads";
import {
  departureFormSchema,
  itineraryDayFormSchema,
  leadsSettingsFormSchema,
  packageFormSchema,
  packageIdSchema,
  packagesSettingsFormSchema,
  pricingTierFormSchema,
  travelSettingsFormSchema,
} from "@/schemas/package-admin";
import { packagesSettingsSchema, travelSettingsSchema } from "@/schemas/packages";
import type { Json } from "@/types/database";
import {
  departureRow,
  isLiveBooking,
  itineraryDayRow,
  leadsSettingsValue,
  packageRow,
  packagesSettingsValue,
  TIER_PROBLEM_KEYS,
  tierRow,
  tierSaveProblem,
  travelSettingsValue,
  type TierRange,
} from "./admin-rows";
import { checkTiers } from "./pricing";

/**
 * Tour package admin mutations, each through {@link mutate}: packages.write
 * (catalog) or settings.write (Settings → Packages & leads); zod; an RLS
 * write as the staff user, audited by the table triggers; the public
 * catalog cache cleared.
 *
 * Checks that need the catalog (tier overlaps, tiers covering a package
 * before it opens for online booking) read it first, as the user, and add
 * their issue to the schema on the `_form` path, so mutate reports them
 * like any other validation error (keys under packagesAdmin.errors).
 */

const notFound = { message: "notFound", code: "notFound" };
const inUse = { message: "inUse", code: "inUse" };
const invalidContent = { message: "invalidContent", code: "invalidContent" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

/** Tier ranges and group limits of a package, read as the user (empty when not visible). */
async function tierContext(packageId: string) {
  const supabase = await createClient();
  const [pkg, tiers] = await Promise.all([
    supabase.from("packages").select("min_pax, max_pax").eq("id", packageId).maybeSingle(),
    supabase.from("package_pricing_tiers").select("id, min_pax, max_pax").eq("package_id", packageId),
  ]);
  return {
    pkg: pkg.data ? { minPax: pkg.data.min_pax, maxPax: pkg.data.max_pax } : null,
    tiers: (tiers.data ?? []).map((t): TierRange => ({ id: t.id, minPax: t.min_pax, maxPax: t.max_pax })),
  };
}

// ---------------------------------------------------------------- media

/** Registers a package photo the browser uploaded to the `media` bucket. */
export async function registerPackageMedia(input: unknown) {
  return mutate("packages.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

// ---------------------------------------------------------------- packages

/**
 * Creates or updates a package. A live package open for online booking
 * needs tiers covering every group size it allows; enquiry-only and hidden
 * packages can be saved with gaps (the editor warns).
 */
export async function savePackage(input: unknown) {
  const pre = packageFormSchema.safeParse(input);
  const tiers = pre.success && pre.data.id ? (await tierContext(pre.data.id)).tiers : [];
  const schema = packageFormSchema.superRefine((p, ctx) => {
    if (p.is_active && p.booking_mode === "book" && checkTiers(tiers, p.min_pax, p.max_pax) !== null) {
      ctx.addIssue({ code: "custom", message: "tiersNeededToBook", path: ["_form"] });
    }
  });
  return mutate("packages.write", schema, input, async (form, supabase) => {
    const row = packageRow(form);
    const { data, error } = form.id
      ? await supabase.from("packages").update(row).eq("id", form.id).select("id").single()
      : await supabase.from("packages").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Soft delete: bookings and leads keep pointing at it; it leaves the site and the default list. */
export async function archivePackage(input: unknown) {
  return mutate("packages.write", packageIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("packages")
      .update({ deleted_at: new Date().toISOString(), is_active: false, is_featured: false })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

/** Brings an archived package back, hidden, so it can be checked before going live. */
export async function restorePackage(input: unknown) {
  return mutate("packages.write", packageIdSchema, input, async ({ id }, supabase) => {
    const { data, error } = await supabase
      .from("packages")
      .update({ deleted_at: null, is_active: false })
      .eq("id", id)
      .not("deleted_at", "is", null)
      .select("id")
      .maybeSingle();
    if (error) return { error };
    return data ? { id } : { error: notFound };
  });
}

// ---------------------------------------------------------------- itinerary

export async function saveItineraryDay(input: unknown) {
  return mutate("packages.write", itineraryDayFormSchema, input, async (form, supabase) => {
    const row = itineraryDayRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("package_itinerary_days")
          .update(row)
          .eq("id", form.id)
          .eq("package_id", form.package_id)
          .select("id")
          .single()
      : await supabase.from("package_itinerary_days").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteItineraryDay(input: unknown) {
  return mutate("packages.write", packageIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("package_itinerary_days").delete().eq("id", id)).error,
  }));
}

// ---------------------------------------------------------------- pricing tiers

/** A tier may not overlap the package's other tiers; a gap is allowed while building them. */
export async function savePricingTier(input: unknown) {
  const pre = pricingTierFormSchema.safeParse(input);
  const context = pre.success ? await tierContext(pre.data.package_id) : null;
  const schema = pricingTierFormSchema.superRefine((tier, ctx) => {
    if (!context?.pkg) return;
    const problem = tierSaveProblem(
      context.tiers,
      { id: tier.id, minPax: tier.min_pax, maxPax: tier.max_pax },
      context.pkg,
    );
    if (problem) ctx.addIssue({ code: "custom", message: TIER_PROBLEM_KEYS[problem], path: ["_form"] });
  });
  return mutate("packages.write", schema, input, async (form, supabase) => {
    const row = tierRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("package_pricing_tiers")
          .update(row)
          .eq("id", form.id)
          .eq("package_id", form.package_id)
          .select("id")
          .single()
      : await supabase.from("package_pricing_tiers").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** The last tiers of a live, bookable package cannot be removed (its price would be gone). */
export async function deletePricingTier(input: unknown) {
  return mutate("packages.write", packageIdSchema, input, async ({ id }, supabase) => {
    const { data: tier, error } = await supabase
      .from("package_pricing_tiers")
      .select("package_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { error };
    if (!tier) return { error: notFound };
    const [pkg, others] = await Promise.all([
      supabase
        .from("packages")
        .select("is_active, booking_mode, deleted_at")
        .eq("id", tier.package_id)
        .maybeSingle(),
      supabase
        .from("package_pricing_tiers")
        .select("id", { count: "exact", head: true })
        .eq("package_id", tier.package_id),
    ]);
    if (pkg.error) return { error: pkg.error };
    if (others.error) return { error: others.error };
    const bookable = pkg.data?.is_active && !pkg.data.deleted_at && pkg.data.booking_mode === "book";
    if (bookable && (others.count ?? 0) <= 1) return { error: inUse };
    return { error: (await supabase.from("package_pricing_tiers").delete().eq("id", id)).error };
  });
}

// ---------------------------------------------------------------- departures

export async function saveDeparture(input: unknown) {
  return mutate("packages.write", departureFormSchema, input, async (form, supabase) => {
    const row = departureRow(form);
    const { data, error } = form.id
      ? await supabase
          .from("package_departures")
          .update(row)
          .eq("id", form.id)
          .eq("package_id", form.package_id)
          .select("id")
          .single()
      : await supabase.from("package_departures").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

/** Travellers on live bookings of a departure (service role: staff may lack bookings.read). */
async function departureHasLiveBookings(departureId: string): Promise<boolean | { message: string }> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("package_bookings")
    .select("booking_id")
    .eq("departure_id", departureId);
  if (error) return error;
  if (!rows.length) return false;
  const { data, error: e } = await admin
    .from("bookings")
    .select("status, expires_at")
    .in(
      "id",
      rows.map((r) => r.booking_id),
    );
  if (e) return e;
  const now = Date.now();
  return data.some((b) => isLiveBooking(b, now));
}

/**
 * A departure with live bookings cannot be deleted: switch it off instead
 * (it stops taking bookings, and the booked travellers keep their date).
 */
export async function deleteDeparture(input: unknown) {
  return mutate("packages.write", packageIdSchema, input, async ({ id }, supabase: Supabase) => {
    const live = await departureHasLiveBookings(id);
    if (typeof live === "object") return { error: live };
    if (live) return { error: inUse };
    return { error: (await supabase.from("package_departures").delete().eq("id", id)).error };
  });
}

// ---------------------------------------------------------------- settings

async function saveSetting(
  supabase: Supabase,
  key: string,
  value: { [key: string]: Json | undefined },
  isPublic: boolean,
) {
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) return { error };
  return {
    error: (
      await supabase
        .from("settings")
        .upsert({ key, value: mergeSettingValue(data?.value, value), is_public: isPublic })
    ).error,
  };
}

/** `packages.defaults`: public (the package pages show the policy and the advance). */
export async function savePackagesSettings(input: unknown) {
  return mutate("settings.write", packagesSettingsFormSchema, input, async (form, supabase) => {
    const value = packagesSettingsSchema.safeParse(packagesSettingsValue(form));
    if (!value.success) return { error: invalidContent };
    return saveSetting(
      supabase,
      "packages.defaults",
      value.data as { [key: string]: Json | undefined },
      true,
    );
  });
}

/** `leads.defaults`: staff only. */
export async function saveLeadsSettings(input: unknown) {
  return mutate("settings.write", leadsSettingsFormSchema, input, async (form, supabase) => {
    const value = leadsSettingsSchema.safeParse(leadsSettingsValue(form));
    if (!value.success) return { error: invalidContent };
    return saveSetting(supabase, "leads.defaults", value.data as { [key: string]: Json | undefined }, false);
  });
}

/** `travel.defaults`: public (the /travel search form reads it); the stored provider is kept. */
export async function saveTravelSettings(input: unknown) {
  return mutate("settings.write", travelSettingsFormSchema, input, async (form, supabase) => {
    const { data: stored, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "travel.defaults")
      .maybeSingle();
    if (error) return { error };
    const current = travelSettingsSchema.safeParse(stored?.value ?? {});
    const provider = current.success ? current.data.provider : "manual";
    const value = travelSettingsSchema.safeParse(travelSettingsValue(form, provider));
    if (!value.success) return { error: invalidContent };
    return saveSetting(supabase, "travel.defaults", value.data as { [key: string]: Json | undefined }, true);
  });
}
