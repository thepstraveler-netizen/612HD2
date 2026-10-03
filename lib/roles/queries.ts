import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads for Admin → Settings → Staff and roles (D-107). Callers check
 * users.manage_roles first; the service role is used so a role manager sees
 * every holder's name and email even without customers.read.
 */

export type RoleOption = { key: string; name: string; isStaff: boolean };

export type RoleHolder = {
  userId: string;
  email: string | null;
  fullName: string | null;
  isBlocked: boolean;
  roles: { key: string; grantedAt: string }[];
};

/** Every role except `customer`, which every account has. */
export async function listRoleOptions(): Promise<RoleOption[]> {
  const { data, error } = await createAdminClient()
    .from("roles")
    .select("key, name, is_staff")
    .neq("key", "customer")
    .order("is_staff", { ascending: false })
    .order("name");
  if (error) throw new Error(`[roles] list roles: ${error.message}`);
  return data.map((r) => ({ key: r.key, name: r.name, isStaff: r.is_staff }));
}

/** People holding any role other than `customer`, staff first, then by name. */
export async function listRoleHolders(): Promise<RoleHolder[]> {
  const db = createAdminClient();
  const { data: roles, error: rolesError } = await db.from("roles").select("id, key, is_staff");
  if (rolesError) throw new Error(`[roles] roles: ${rolesError.message}`);
  const byId = new Map(roles.filter((r) => r.key !== "customer").map((r) => [r.id, r]));
  const { data: grants, error } = await db
    .from("user_roles")
    .select("user_id, role_id, created_at")
    .in("role_id", [...byId.keys()])
    .order("created_at");
  if (error) throw new Error(`[roles] grants: ${error.message}`);
  const userIds = [...new Set(grants.map((g) => g.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await db.from("profiles").select("id, email, full_name, is_blocked").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`[roles] profiles: ${profilesError.message}`);
  const profile = new Map(profiles.map((p) => [p.id, p]));

  const holders = new Map<string, RoleHolder>();
  const staff = new Set<string>();
  for (const g of grants) {
    const role = byId.get(g.role_id);
    if (!role) continue;
    const p = profile.get(g.user_id);
    const holder = holders.get(g.user_id) ?? {
      userId: g.user_id,
      email: p?.email ?? null,
      fullName: p?.full_name ?? null,
      isBlocked: p?.is_blocked ?? false,
      roles: [],
    };
    holder.roles.push({ key: role.key, grantedAt: g.created_at });
    if (role.is_staff) staff.add(g.user_id);
    holders.set(g.user_id, holder);
  }
  return [...holders.values()].sort(
    (a, b) =>
      Number(staff.has(b.userId)) - Number(staff.has(a.userId)) ||
      (a.fullName ?? a.email ?? "").localeCompare(b.fullName ?? b.email ?? ""),
  );
}
