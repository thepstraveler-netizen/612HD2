import "server-only";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportKey } from "@/schemas/engagement-admin";
import { parseDashboard, type DashboardData, type ReportRows } from "./rows";

/**
 * Admin insights reads. Every figure is aggregated in Postgres by the
 * service-role report functions (migration 20261010000300_reports.sql); the
 * permission is checked here first, on the server, every time.
 *   * Dashboard figures: reports.read or payments.read.
 *   * Pending actions: dashboard.read (the page shows each count only to
 *     viewers who may open the screen it links to).
 *   * Reports and their CSV: reports.read.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[reports] ${scope}: ${error.message}`);
}

/** Throws unless the signed-in, unblocked user holds at least one of the permissions. */
async function assertAnyPermission(permissions: readonly PermissionKey[]): Promise<void> {
  const session = await getSession();
  if (!session) throw new AuthorizationError();
  if (session.profile?.is_blocked || !permissions.some((p) => hasPermission(session.permissions, p))) {
    throw new AuthorizationError(permissions[0]);
  }
}

export const DASHBOARD_FIGURE_PERMISSIONS: readonly PermissionKey[] = ["reports.read", "payments.read"];

export async function getDashboard(from: string, to: string): Promise<DashboardData> {
  await assertAnyPermission(DASHBOARD_FIGURE_PERMISSIONS);
  const { data, error } = await createAdminClient().rpc("report_dashboard", { p_from: from, p_to: to });
  if (error) fail("dashboard", error);
  return parseDashboard(data);
}

export async function getPendingActionCounts(): Promise<Record<string, unknown>> {
  await assertPermission("dashboard.read");
  const { data, error } = await createAdminClient().rpc("report_pending_actions", {});
  if (error) fail("pending actions", error);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

const RPC = {
  sales: "report_sales",
  occupancy: "report_occupancy",
  vendors: "report_vendor_performance",
  agents: "report_agent_performance",
  coupons: "report_coupon_usage",
  cancellations: "report_cancellations",
} as const satisfies Record<ReportKey, string>;

export async function getReport<K extends ReportKey>(
  report: K,
  from: string,
  to: string,
): Promise<ReportRows[K]> {
  await assertPermission("reports.read");
  // Every report function takes (p_from, p_to); the row type follows the report key.
  const fn = RPC[report] as (typeof RPC)["sales"];
  const { data, error } = await createAdminClient().rpc(fn, { p_from: from, p_to: to });
  if (error) fail(report, error);
  return (data ?? []) as unknown as ReportRows[K];
}
