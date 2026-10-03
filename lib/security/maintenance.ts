import "server-only";
import { draftMode } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { visibleModules } from "@/lib/permissions/check";

/**
 * Maintenance mode (feature flag `site.maintenance_mode`, D-099), enforced by
 * the public layout. Public pages are static / ISR, so the visitor's cookies
 * can't be read there without breaking the cache. Instead:
 *
 *   - flag off              → "off": the site renders as usual (one cached read)
 *   - flag on, normal visit → "closed": the maintenance page, cached like any page
 *   - flag on, staff visit  → staff open /api/security/maintenance-preview, which
 *     checks they hold an admin permission and turns on Next's draft mode; draft
 *     mode renders pages per request, so here we can confirm the session again
 *     and return "preview".
 *
 * /admin, /account, /login and the partner, driver and rider portals live
 * outside the public layout and stay reachable throughout.
 */

export type MaintenanceState = "off" | "closed" | "preview";

export const MAINTENANCE_FLAG = "site.maintenance_mode";
export const MAINTENANCE_PREVIEW_PATH = "/api/security/maintenance-preview";

/** Staff = anyone who can open at least one admin module. */
export function isStaff(permissions: Iterable<string>): boolean {
  return visibleModules(permissions).length > 0;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (!(await getFeatureFlag(MAINTENANCE_FLAG))) return "off";
  if (!(await draftMode()).isEnabled) return "closed";
  const session = await getSession();
  return session && !session.profile?.is_blocked && isStaff(session.permissions) ? "preview" : "closed";
}
