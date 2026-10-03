import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session on every request and writes any rotated
 * cookies onto `response` (the next-intl response, so locale handling and
 * auth cookies travel together). Returns the signed-in user's id, or null.
 *
 * getClaims() checks the JWT signature locally against the project's
 * published signing keys (cached), so a signed-in visitor's click no longer
 * waits on a round trip to Supabase Auth; it still refreshes an expired
 * session and falls back to asking Auth for projects on legacy shared-secret
 * keys. Pages that read data re-check the user server-side (getSession).
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { user: null };

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // No auth cookie: a visitor, nothing to refresh or verify.
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return { user: null };

  // Never trust getSession() here: getClaims() verifies the signature.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims.sub;
  return { user: sub ? { id: sub } : null };
}
