import "server-only";
import { mapsUrl } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums, Tables } from "@/types/database";

/**
 * The driver's ride page works from the secret link alone (no login), like
 * cab trips: the token is looked up with the service role and only this
 * ride's pickup details are returned. The link stops working a day after
 * pickup or once the ride is reassigned.
 */

export type DriverRide = Pick<
  Tables<"ride_requests">,
  | "id"
  | "mode"
  | "pickup_address"
  | "drop_address"
  | "hours"
  | "pickup_at"
  | "passengers"
  | "distance_km"
  | "status"
  | "driver_name"
  | "vehicle_label"
  | "vehicle_registration"
> & {
  code: string;
  customerName: string;
  customerPhone: string;
  /** What the driver collects at the end. */
  balancePaise: number;
  route: string;
  pickupMap: string;
  dropMap: string | null;
  requireOtp: boolean;
};

/** Steps a driver can take from each status. */
export const RIDE_DRIVER_NEXT: Partial<Record<Enums<"ride_status">, Enums<"ride_status">[]>> = {
  assigned: ["en_route", "arrived"],
  en_route: ["arrived"],
  arrived: ["picked_up", "no_show"],
  picked_up: ["completed"],
};

export async function rideByToken(token: string): Promise<Tables<"ride_requests"> | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data: ride } = await createAdminClient()
    .from("ride_requests")
    .select("*")
    .eq("driver_token", token)
    .maybeSingle();
  if (!ride || !ride.driver_token_expires_at || Date.parse(ride.driver_token_expires_at) < Date.now())
    return null;
  return ride;
}

export async function getDriverRide(token: string): Promise<DriverRide | null> {
  const ride = await rideByToken(token);
  if (!ride) return null;
  const admin = createAdminClient();
  const [{ data: booking }, { data: settings }] = await Promise.all([
    admin
      .from("bookings")
      .select("code, contact_name, contact_phone, total_paise, paid_paise, snapshot")
      .eq("id", ride.booking_id)
      .maybeSingle(),
    admin.from("settings").select("value").eq("key", "rides.defaults").maybeSingle(),
  ]);
  if (!booking) return null;
  const snapshot = booking.snapshot as { trip?: { route?: string; label?: string } };
  const requireOtp = (settings?.value as { require_pickup_otp?: boolean } | null)?.require_pickup_otp ?? true;
  return {
    id: ride.id,
    mode: ride.mode,
    pickup_address: ride.pickup_address,
    drop_address: ride.drop_address,
    hours: ride.hours,
    pickup_at: ride.pickup_at,
    passengers: ride.passengers,
    distance_km: ride.distance_km,
    status: ride.status,
    driver_name: ride.driver_name,
    vehicle_label: ride.vehicle_label,
    vehicle_registration: ride.vehicle_registration,
    code: booking.code,
    customerName: booking.contact_name,
    customerPhone: booking.contact_phone,
    balancePaise: Math.max(0, booking.total_paise - booking.paid_paise),
    route: snapshot.trip?.route ?? snapshot.trip?.label ?? "",
    pickupMap: mapsUrl(ride.pickup_lat, ride.pickup_lng),
    dropMap: ride.drop_lat !== null && ride.drop_lng !== null ? mapsUrl(ride.drop_lat, ride.drop_lng) : null,
    requireOtp,
  };
}
