/**
 * Staff password rule (D-111), kept pure so it can be unit-tested. Anyone
 * who can open an admin module must have signed in to the current session
 * with a password (not only a magic link or Google), and that password must
 * be strong: at least 8 characters with a letter, a number and a symbol.
 */

export const MIN_PASSWORD_LENGTH = 8;

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /\p{L}/u.test(password) &&
    /\p{N}/u.test(password) &&
    /[^\p{L}\p{N}\s]/u.test(password)
  );
}

/** The sign-in methods (`amr`) recorded in a Supabase access token, e.g. ["password", "totp"]. */
export function amrMethodsFromAccessToken(token: string | null | undefined): string[] {
  const part = token?.split(".")[1];
  if (!part) return [];
  try {
    const json: unknown = JSON.parse(
      Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    const amr = json && typeof json === "object" ? (json as { amr?: unknown }).amr : null;
    if (!Array.isArray(amr)) return [];
    return amr.flatMap((entry: unknown) => {
      if (typeof entry === "string") return [entry];
      const method = entry && typeof entry === "object" ? (entry as { method?: unknown }).method : null;
      return typeof method === "string" ? [method] : [];
    });
  } catch {
    return [];
  }
}

export type StaffPasswordDecision = "allow" | "confirmPassword" | "strengthenPassword";

export function decideStaffPassword({
  isStaff,
  methods,
  passwordStrong,
}: {
  isStaff: boolean;
  methods: string[];
  passwordStrong: boolean;
}): StaffPasswordDecision {
  if (!isStaff) return "allow";
  if (!methods.includes("password")) return "confirmPassword";
  if (!passwordStrong) return "strengthenPassword";
  return "allow";
}

export function staffPasswordRedirectHref(decision: StaffPasswordDecision, nextPath: string): string | null {
  const next = encodeURIComponent(nextPath);
  if (decision === "confirmPassword") return `/account/admin-password?next=${next}`;
  if (decision === "strengthenPassword") return `/account/update-password?reason=admin&next=${next}`;
  return null;
}
