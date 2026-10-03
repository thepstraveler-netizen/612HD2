"use server";

import { revalidatePath } from "next/cache";
import type { MutationResult } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { grantRoleSchema, revokeRoleSchema } from "@/schemas/roles";

/**
 * Grant and revoke roles (users.manage_roles, D-107). Writes run as the
 * signed-in staff member, so RLS on user_roles applies (only a super admin
 * can grant or remove super_admin) and the audit log names them. The
 * database also refuses to remove the last super admin.
 */

async function authorise(): Promise<SessionContext | MutationResult> {
  try {
    return await assertPermission("users.manage_roles");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

function refresh() {
  revalidatePath("/[locale]/admin/settings/users", "page");
}

async function roleId(key: string): Promise<string | null> {
  const { data } = await createAdminClient().from("roles").select("id").eq("key", key).maybeSingle();
  return data?.id ?? null;
}

export async function grantRole(input: unknown): Promise<MutationResult> {
  const session = await authorise();
  if ("ok" in session) return session;
  const parsed = grantRoleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  const { email, role } = parsed.data;
  if (role === "customer") return { ok: false, error: "invalidRole", field: "role" };
  const id = await roleId(role);
  if (!id) return { ok: false, error: "invalidRole", field: "role" };

  // The person must already have an account (they sign up first).
  const { data: profile, error: lookupError } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("[roles] lookup", lookupError);
    return { ok: false, error: "saveFailed" };
  }
  if (!profile) return { ok: false, error: "noAccount", field: "email" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: profile.id, role_id: id, granted_by: session.user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "alreadyHasRole", field: "role" };
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    console.error("[roles] grant", error);
    return { ok: false, error: "saveFailed" };
  }
  refresh();
  return { ok: true, id: profile.id };
}

export async function revokeRole(input: unknown): Promise<MutationResult> {
  const session = await authorise();
  if ("ok" in session) return session;
  const parsed = revokeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user_id, role } = parsed.data;
  // Staff can't lock themselves out by removing their own access.
  if (user_id === session.user.id) return { ok: false, error: "ownRole" };
  const id = await roleId(role);
  if (!id) return { ok: false, error: "invalidRole" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", user_id)
    .eq("role_id", id)
    .select("user_id");
  if (error) {
    if (error.message.includes("last_super_admin")) return { ok: false, error: "lastSuperAdmin" };
    console.error("[roles] revoke", error);
    return { ok: false, error: "saveFailed" };
  }
  // RLS hides rows this person may not remove (super_admin, unless they are one).
  if (!data.length) return { ok: false, error: "forbidden" };
  refresh();
  return { ok: true, id: user_id };
}
