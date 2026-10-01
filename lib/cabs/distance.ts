import { estimateTrip } from "./pricing";

/**
 * Where trip distance comes from when the admin has no route row for a
 * pair of places. The default needs no API key: straight-line distance ×
 * a road factor from settings. A maps provider (Google Distance Matrix,
 * OSRM) can implement the same interface later without touching pricing.
 */

export type LatLng = { lat: number; lng: number };
export type TripEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "route" | "estimate" | "provider";
};

export interface DistanceProvider {
  estimate(from: LatLng, to: LatLng): Promise<TripEstimate>;
}

export function straightLineProvider(opts: { roadFactor: number; avgSpeedKmph: number }): DistanceProvider {
  return {
    async estimate(from, to) {
      return { ...estimateTrip(from, to, opts), source: "estimate" };
    },
  };
}
