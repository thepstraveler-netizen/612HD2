import { TRIPS_CACHE } from "./brand";

/**
 * Forget the trip pages saved for offline use (call on sign-out so the next
 * person on a shared phone can't open them). Never throws.
 */
export async function clearOfflineTrips(): Promise<void> {
  try {
    if (typeof window === "undefined" || !("caches" in window)) return;
    await caches.delete(TRIPS_CACHE);
    navigator.serviceWorker?.controller?.postMessage("ps:clear-trips");
  } catch {
    // Storage can be blocked (private mode); nothing to clear then.
  }
}

/** Booking codes of the trip pages saved for offline use, newest first. */
export async function savedTripPaths(): Promise<string[]> {
  try {
    if (typeof window === "undefined" || !("caches" in window)) return [];
    if (!(await caches.has(TRIPS_CACHE))) return [];
    const cache = await caches.open(TRIPS_CACHE);
    const keys = await cache.keys();
    return keys.map((req) => new URL(req.url).pathname).reverse();
  } catch {
    return [];
  }
}
