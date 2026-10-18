import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { SessionContext } from "@/lib/auth/session";
import { visibleModules } from "@/lib/permissions/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  amrMethodsFromAccessToken,
  decideStaffPassword,
  staffPasswordRedirectHref,
  type StaffPasswordDecision,
} from "./staff-password";

/** Server side of the staff password rule (lib/auth/staff-password.ts). */

export async function staffPasswordDecision(session: SessionContext): Promise<StaffPasswordDecision> {
  const isStaff = visibleModules(session.permissions).length > 0;
  if (!isStaff) return "allow";
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return decideStaffPassword({
    isStaff,
    methods: amrMethodsFromAccessToken(data.session?.access_token),
    // getUser() (session.ts) reads app_metadata fresh from Supabase Auth.
    passwordStrong: session.user.app_metadata?.password_strong === true,
  });
}

/** For admin pages and layouts. */
export async function enforceStaffPassword(session: SessionContext, nextPath: string): Promise<void> {
  const href = staffPasswordRedirectHref(await staffPasswordDecision(session), nextPath);
  if (href) redirect({ href, locale: await getLocale() });
}

/**
 * Records whether the password the user just typed meets the rule, in
 * app_metadata (which only the service role can write). Skipped when unchanged.
 */
export async function recordPasswordStrength(
  userId: string,
  current: Record<string, unknown> | undefined,
  strong: boolean,
): Promise<void> {
  if (current?.password_strong === strong) return;
  await createAdminClient().auth.admin.updateUserById(userId, {
    app_metadata: { password_strong: strong },
  });
}
