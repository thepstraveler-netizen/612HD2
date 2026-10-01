import "server-only";
import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type SessionContext = {
  user: User;
  profile: Tables<"profiles"> | null;
  roles: string[];
  permissions: string[];
};

/**
 * The signed-in user with roles and permissions, resolved once per request
 * (React `cache`) no matter how many components ask.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile, roles, permissions] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("current_user_roles"),
    supabase.rpc("current_user_permissions"),
  ]);

  return {
    user,
    profile: profile.data,
    roles: roles.data ?? [],
    permissions: permissions.data ?? [],
  };
});
