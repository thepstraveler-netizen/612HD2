import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { hasPermission } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/constants";
import { getSession, type SessionContext } from "./session";

export class AuthorizationError extends Error {
  constructor(public readonly permission?: PermissionKey) {
    super(permission ? `Missing permission: ${permission}` : "Not signed in");
    this.name = "AuthorizationError";
  }
}

/** For pages and layouts: redirects to login when signed out. */
export async function requireUser(nextPath?: string): Promise<SessionContext> {
  const session = await getSession();
  if (!session) {
    const locale = await getLocale();
    const query = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    return redirect({ href: `/login${query}`, locale });
  }
  if (session.profile?.is_blocked) {
    const locale = await getLocale();
    return redirect({ href: "/forbidden?reason=blocked", locale });
  }
  return session;
}

/**
 * For pages and layouts: the server-side twin of Postgres has_permission().
 * Redirects to /forbidden when the user lacks the permission. RLS still
 * enforces the same rule on every query, so this is defence in depth.
 */
export async function requirePermission(
  permission: PermissionKey,
  nextPath?: string,
): Promise<SessionContext> {
  const session = await requireUser(nextPath);
  if (!hasPermission(session.permissions, permission)) {
    const locale = await getLocale();
    return redirect({ href: "/forbidden", locale });
  }
  return session;
}

/**
 * For Server Actions and Route Handlers: throws instead of redirecting so the
 * caller can return a typed error. Every admin mutation starts with this.
 */
export async function assertPermission(permission: PermissionKey): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new AuthorizationError();
  if (session.profile?.is_blocked || !hasPermission(session.permissions, permission)) {
    throw new AuthorizationError(permission);
  }
  return session;
}
