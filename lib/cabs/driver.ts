import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums, Tables } from "@/types/database";

/**
 * The driver's trip page works from the secret link alone (no login): the
 * token is looked up with the service role and only this trip's pickup
 * details are returned. The link stops working after the trip window or
 * once the trip is reassigned.
 */

export type DriverTrip = Pick<
  Tables<"trips">,
  | "id"
  | "trip_type"
  | "pickup_address"
  | "drop_address"
  | "stops"
  | "pickup_at"
  | "return_at"
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
  /** What the driver collects in cash at the end. */
  balancePaise: number;
  route: string;
  requireOtp: boolean;
};

/** Steps a driver can take from each status. */
export const DRIVER_NEXT: Partial<Record<Enums<"trip_status">, Enums<"trip_status">[]>> = {
  assigned: ["en_route"],
  en_route: ["arrived"],
  arrived: ["picked_up", "no_show"],
  picked_up: ["completed"],
};

export async function getDriverTrip(token: string): Promise<DriverTrip | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: trip } = await admin.from("trips").select("*").eq("driver_token", token).maybeSingle();
  if (!trip || !trip.driver_token_expires_at || Date.parse(trip.driver_token_expires_at) < Date.now())
    return null;
  const [{ data: booking }, { data: settings }] = await Promise.all([
    admin
      .from("bookings")
      .select("code, contact_name, contact_phone, total_paise, paid_paise, refunded_paise, snapshot")
      .eq("id", trip.booking_id)
      .maybeSingle(),
    admin.from("settings").select("value").eq("key", "cabs.defaults").maybeSingle(),
  ]);
  if (!booking) return null;
  const snapshot = booking.snapshot as { trip?: { route?: string; label?: string } };
  const requireOtp = (settings?.value as { require_pickup_otp?: boolean } | null)?.require_pickup_otp ?? true;
  return {
    id: trip.id,
    trip_type: trip.trip_type,
    pickup_address: trip.pickup_address,
    drop_address: trip.drop_address,
    stops: trip.stops,
    pickup_at: trip.pickup_at,
    return_at: trip.return_at,
    passengers: trip.passengers,
    distance_km: trip.distance_km,
    status: trip.status,
    driver_name: trip.driver_name,
    vehicle_label: trip.vehicle_label,
    vehicle_registration: trip.vehicle_registration,
    code: booking.code,
    customerName: booking.contact_name,
    customerPhone: booking.contact_phone,
    balancePaise: Math.max(0, booking.total_paise - booking.paid_paise),
    route: snapshot.trip?.route ?? snapshot.trip?.label ?? "",
    requireOtp,
  };
}
