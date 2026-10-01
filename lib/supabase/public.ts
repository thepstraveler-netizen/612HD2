import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cookie-less anon client for public catalog reads. Because it carries no
 * user session it can be used inside `unstable_cache`, and RLS returns only
 * what signed-out visitors may see. Returns null when Supabase isn't
 * configured (CI, first local run).
 */
export function createPublicClient() {
  if (!isSupabaseConfigured()) return null;
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
