import "server-only";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { SessionContext } from "@/lib/auth/session";
import { visibleModules } from "@/lib/permissions/check";
import { getSecuritySettings } from "@/lib/security/settings";
import { createClient } from "@/lib/supabase/server";
import {
  aalFromAccessToken,
  decideMfa,
  hasVerifiedFactor,
  mfaRedirectHref,
  type AssuranceLevel,
  type MfaDecision,
} from "./policy";

/**
 * Server side of two-step sign-in: reads the session's assurance level and
 * `security.defaults` (lib/security/settings.ts) and applies {@link decideMfa}.
 * Called from the auth guards, so every admin page, the account area and the
 * vendor / driver portals check it.
 */

/** The `aal` of the current session's access token (getUser() already validated it). */
export const getAssuranceLevel = cache(async (): Promise<AssuranceLevel | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return aalFromAccessToken(data.session?.access_token);
});

const areaFor = (path: string) => (path === "/admin" || path.startsWith("/admin/") ? "admin" : "other");

export async function mfaDecision(session: SessionContext, nextPath: string): Promise<MfaDecision> {
  const area = areaFor(nextPath);
  const [currentLevel, settings] = await Promise.all([
    getAssuranceLevel(),
    area === "admin" ? getSecuritySettings() : Promise.resolve(null),
  ]);
  return decideMfa({
    area,
    hasVerifiedFactor: hasVerifiedFactor(session.user.factors),
    currentLevel,
    requireAdminMfa: settings?.require_admin_mfa ?? false,
  });
}

/** For pages and layouts: sends the user to the code prompt or the security page when needed. */
export async function enforceMfa(session: SessionContext, nextPath: string): Promise<void> {
  const href = mfaRedirectHref(await mfaDecision(session, nextPath), nextPath);
  if (href) redirect({ href, locale: await getLocale() });
}

/**
 * For actions and route handlers: false when an enrolled user has not
 * entered their code yet, or when a staff member (anyone holding an admin
 * module permission) has no factor while `require_admin_mfa` is on.
 */
export async function mfaSatisfied(session: SessionContext): Promise<boolean> {
  if (hasVerifiedFactor(session.user.factors)) return (await getAssuranceLevel()) === "aal2";
  if (visibleModules(session.permissions).length === 0) return true;
  return !(await getSecuritySettings()).require_admin_mfa;
}
