import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

/**
 * Privacy request reads. The customer's own view uses the service role
 * scoped to the session's user id (the caller passes it from requireUser);
 * staff reads check customers.read first.
 */

export type PrivacyRequestRow = Pick<
  Tables<"privacy_requests">,
  | "id"
  | "user_id"
  | "email"
  | "kind"
  | "status"
  | "reason"
  | "note"
  | "processed_by"
  | "processed_at"
  | "created_at"
>;

const COLUMNS = "id, user_id, email, kind, status, reason, note, processed_by, processed_at, created_at";

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[privacy] ${scope}: ${error.message}`);
}

export type OwnPrivacyOverview = {
  blockers: number;
  pendingDeletion: PrivacyRequestRow | null;
  lastExportAt: string | null;
};

export async function getOwnPrivacyOverview(userId: string): Promise<OwnPrivacyOverview> {
  const db = createAdminClient();
  const [blockers, pending, lastExport] = await Promise.all([
    db.rpc("account_deletion_blockers", { p_user: userId }),
    db
      .from("privacy_requests")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("kind", "delete")
      .eq("status", "pending")
      .maybeSingle(),
    db
      .from("privacy_requests")
      .select("created_at")
      .eq("user_id", userId)
      .eq("kind", "export")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (blockers.error) fail("blockers", blockers.error);
  if (pending.error) fail("pending", pending.error);
  if (lastExport.error) fail("last export", lastExport.error);
  return {
    blockers: blockers.data ?? 0,
    pendingDeletion: pending.data,
    lastExportAt: lastExport.data?.created_at ?? null,
  };
}

export type PendingDeletionRow = PrivacyRequestRow & {
  name: string | null;
  blockers: number;
};

/** Admin → Customers → Privacy requests: open deletion requests, oldest first. */
export async function listPendingDeletionRequests(): Promise<PendingDeletionRow[]> {
  await assertPermission("customers.read");
  const db = createAdminClient();
  const { data, error } = await db
    .from("privacy_requests")
    .select(COLUMNS)
    .eq("kind", "delete")
    .eq("status", "pending")
    .order("created_at")
    .limit(200);
  if (error) fail("pending list", error);
  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
  const [profiles, blockers] = await Promise.all([
    userIds.length
      ? db.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    Promise.all(
      userIds.map(async (id) => {
        const r = await db.rpc("account_deletion_blockers", { p_user: id });
        if (r.error) fail("blockers", r.error);
        return [id, r.data ?? 0] as const;
      }),
    ),
  ]);
  if (profiles.error) fail("names", profiles.error);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const counts = new Map(blockers);
  return rows.map((r) => ({
    ...r,
    name: r.user_id ? (names.get(r.user_id) ?? null) : null,
    blockers: r.user_id ? (counts.get(r.user_id) ?? 0) : 0,
  }));
}

/** One customer's privacy requests (exports and deletions), newest first. */
export async function listCustomerPrivacyRequests(userId: string): Promise<PrivacyRequestRow[]> {
  await assertPermission("customers.read");
  const { data, error } = await createAdminClient()
    .from("privacy_requests")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail("customer requests", error);
  return data ?? [];
}
