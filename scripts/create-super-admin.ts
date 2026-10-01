/**
 * Creates (or promotes) the first super admin.
 *
 *   pnpm admin:create owner@example.com "Owner Name"
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * If the user does not exist yet it is created with a confirmed email and a
 * magic-link-only login (no password); otherwise the existing user is promoted.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

async function main() {
  const [email, fullName = "Super Admin"] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: pnpm admin:create <email> ["Full Name"]');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError && createError.code !== "email_exists") {
    throw createError;
  }

  const { data: userId, error } = await supabase.rpc("grant_role_by_email", {
    p_email: email,
    p_role: "super_admin",
  });
  if (error) throw error;

  console.log(`✔ ${email} (${userId}) is now a super_admin. Log in with a magic link or Google.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
