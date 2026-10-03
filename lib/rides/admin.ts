import "server-only";
import { pickLocalized } from "@/lib/i18n/localized";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RideBoardFilters } from "@/schemas/ride-admin";
import type { Tables } from "@/types/database";
import {
  RIDE_ACTIVE_STATUSES,
  RIDE_FINISHED_STATUSES,
  boardStatuses,
  isRideVehicle,
  rideDayBounds,
  type RideVehicle,
} from "./admin-rows";

/**
 * Admin reads for the rides module. Catalog and fleet rows are read as the
 * signed-in user (RLS: rides.read), uncached, inactive rows included.
 * Booking contact and payment details on the board and the ride page need
 * the service role: the callers have already checked rides.read
 * (requirePermission) and only those columns leave here. The driver link
 * token is never read here (see lib/rides/admin-actions.ts).
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[rides admin] ${scope}: ${error.message}`);
}

const BOARD_LIMIT = 300;
/** Finished rides stay on the default board this long. */
const RECENT_HOURS = 24;

// ---------------------------------------------------------------- catalog

export async function listVehicleTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ride_vehicle_types")
    .select("*")
    .order("sort_order")
    .order("key");
  if (error) fail("vehicle types", error);
  return data;
}

export async function getVehicleType(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ride_vehicle_types").select("*").eq("id", id).maybeSingle();
  if (error) fail("vehicle type", error);
  return data;
}

/** Service pages a vehicle type can link to. */
export async function listServiceOptions(locale: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("slug, name")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) fail("services", error);
  return data.map((s) => ({ value: s.slug, label: pickLocalized(s.name, locale) }));
}

export async function listZones() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ride_zones").select("*").order("sort_order").order("slug");
  if (error) fail("zones", error);
  return data;
}

export async function getZone(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ride_zones").select("*").eq("id", id).maybeSingle();
  if (error) fail("zone", error);
  return data;
}

export async function listPoints(zoneId?: string) {
  const supabase = await createClient();
  let query = supabase.from("ride_points").select("*");
  if (zoneId) query = query.eq("zone_id", zoneId);
  const { data, error } = await query.order("sort_order").order("slug");
  if (error) fail("points", error);
  return data;
}

export async function getPoint(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ride_points").select("*").eq("id", id).maybeSingle();
  if (error) fail("point", error);
  return data;
}

export async function listRideFareRules(zoneId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ride_fare_rules").select("*").eq("zone_id", zoneId);
  if (error) fail("fare rules", error);
  return data;
}

// ---------------------------------------------------------------- fleet

export async function listActiveDrivers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, phone, is_active")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("full_name");
  if (error) fail("drivers", error);
  return data;
}

export async function listRideVehicles(): Promise<RideVehicle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .is("deleted_at", null)
    .not("ride_vehicle_type_id", "is", null)
    .order("is_active", { ascending: false })
    .order("registration_no", { nullsFirst: false })
    .order("created_at");
  if (error) fail("vehicles", error);
  return data.filter(isRideVehicle);
}

export async function getRideVehicle(id: string): Promise<RideVehicle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("vehicle", error);
  return data && isRideVehicle(data) ? data : null;
}

/** "Bike · UP85 AB 1234 · Red", or the type and colour for an unregistered rickshaw. */
export function rideVehicleLabel(
  v: Pick<Tables<"vehicles">, "registration_no" | "colour">,
  typeName: string | undefined,
): string {
  return [typeName, v.registration_no, v.colour].filter(Boolean).join(" · ");
}

/** Active drivers and ride vehicles (any type) for the assign dialog. */
export async function getRideAssignOptions(locale: string) {
  const supabase = await createClient();
  const [drivers, vehicles, types] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, full_name, phone")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("vehicles")
      .select("id, ride_vehicle_type_id, registration_no, colour, default_driver_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .not("ride_vehicle_type_id", "is", null),
    supabase.from("ride_vehicle_types").select("id, name"),
  ]);
  if (drivers.error) fail("drivers", drivers.error);
  if (vehicles.error) fail("vehicles", vehicles.error);
  if (types.error) fail("types", types.error);
  const typeName = new Map(types.data.map((t) => [t.id, pickLocalized(t.name, locale)]));
  return {
    drivers: drivers.data.map((d) => ({ value: d.id, label: `${d.full_name} · ${d.phone}` })),
    vehicles: vehicles.data.filter(isRideVehicle).map((v) => ({
      id: v.id,
      typeId: v.ride_vehicle_type_id,
      defaultDriverId: v.default_driver_id,
      label: rideVehicleLabel(v, typeName.get(v.ride_vehicle_type_id)),
    })),
  };
}

// ---------------------------------------------------------------- rides

export type RideBookingInfo = {
  id: string;
  code: string;
  contact_name: string;
  contact_phone: string;
  payment_mode: string;
  total_paise: number;
  paid_paise: number;
  status: string;
};

/** Code, contact and payment of the bookings behind some rides (service role; the caller checked rides.read). */
async function bookingInfo(ids: string[]): Promise<Map<string, RideBookingInfo>> {
  if (!ids.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id, code, contact_name, contact_phone, payment_mode, total_paise, paid_paise, status")
    .in("id", [...new Set(ids)]);
  if (error) fail("bookings", error);
  return new Map(data.map((b) => [b.id, b]));
}

/** Every column except the driver link token (not granted to staff). */
const RIDE_COLUMNS =
  "id, booking_id, vehicle_type_id, zone_id, mode, pickup_point_id, pickup_lat, pickup_lng, pickup_address, drop_point_id, drop_lat, drop_lng, drop_address, hours, pickup_at, passengers, distance_km, status, driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration, assigned_at, started_at, picked_up_at, completed_at, rating, rating_comment, rated_at, created_at, updated_at";

export type AdminRide = Omit<
  Tables<"ride_requests">,
  "driver_token" | "driver_token_expires_at" | "pickup_otp"
> & {
  booking: RideBookingInfo | null;
};

/**
 * The live board. With a date: every ride picked up that India day. Without:
 * open rides (requested and under way, any day) plus rides finished in the
 * last 24 hours. A status filter (group or single status) narrows either.
 */
export async function listBoardRides(filters: RideBoardFilters): Promise<AdminRide[]> {
  const supabase = await createClient();
  const statuses = boardStatuses(filters.status);
  let query = supabase.from("ride_requests").select(RIDE_COLUMNS);
  if (filters.date) {
    const { start, end } = rideDayBounds(filters.date);
    query = query.gte("pickup_at", start).lt("pickup_at", end);
    query = statuses ? query.in("status", [...statuses]) : query.neq("status", "awaiting_payment");
  } else if (statuses) {
    query = query.in("status", [...statuses]);
    if (statuses.every((s) => RIDE_FINISHED_STATUSES.includes(s))) {
      query = query.gte("updated_at", new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString());
    }
  } else {
    const since = new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString();
    const open = ["requested", ...RIDE_ACTIVE_STATUSES].join(",");
    const done = RIDE_FINISHED_STATUSES.join(",");
    query = query.or(`status.in.(${open}),and(status.in.(${done}),updated_at.gte."${since}")`);
  }
  const { data, error } = await query.order("pickup_at").limit(BOARD_LIMIT);
  if (error) fail("board", error);
  const info = await bookingInfo(data.map((r) => r.booking_id));
  return data.map((r) => ({ ...r, booking: info.get(r.booking_id) ?? null }));
}

export async function getRide(id: string) {
  const supabase = await createClient();
  // The pickup OTP is not in the column grant (D-098); ride_otp returns it to ride staff.
  const [ride, events, otp] = await Promise.all([
    supabase.from("ride_requests").select(RIDE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("ride_events").select("*").eq("ride_id", id).order("created_at"),
    supabase.rpc("ride_otp", { p_ride_id: id }),
  ]);
  if (ride.error) fail("ride", ride.error);
  if (events.error) fail("ride events", events.error);
  if (!ride.data) return null;
  const info = await bookingInfo([ride.data.booking_id]);
  return {
    ride: {
      ...ride.data,
      pickup_otp: otp.data ?? null,
      booking: info.get(ride.data.booking_id) ?? null,
    } as AdminRide & { pickup_otp: string | null },
    events: events.data,
  };
}

/** Names for the ids a ride points at, in the viewer's language. */
export type RideLookups = {
  types: Map<string, string>;
  zones: Map<string, string>;
  points: Map<string, string>;
};

export async function rideLookups(locale: string): Promise<RideLookups> {
  const supabase = await createClient();
  const [types, zones, points] = await Promise.all([
    supabase.from("ride_vehicle_types").select("id, name"),
    supabase.from("ride_zones").select("id, name"),
    supabase.from("ride_points").select("id, name"),
  ]);
  if (types.error) fail("types", types.error);
  if (zones.error) fail("zones", zones.error);
  if (points.error) fail("points", points.error);
  const names = (rows: { id: string; name: Tables<"ride_zones">["name"] }[]) =>
    new Map(rows.map((r) => [r.id, pickLocalized(r.name, locale)]));
  return { types: names(types.data), zones: names(zones.data), points: names(points.data) };
}
