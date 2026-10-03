"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { isSupabaseConfigured } from "@/lib/env";
import { localizedPath } from "@/lib/routing/protected";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyCaptcha } from "@/lib/security/turnstile";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";
import {
  forgotPasswordSchema,
  magicLinkSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type ActionResult,
} from "@/schemas/auth";

/**
 * Origin for auth email links. Prefer the request's own host so Vercel
 * preview deployments send users back to the preview, not production. Each
 * origin must be in Supabase Auth's redirect allow-list.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

async function callbackUrl(next: string): Promise<string> {
  return `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

async function defaultNext(next?: string | null): Promise<string> {
  return safeNextPath(next, localizedPath(await getLocale(), "/account"));
}

/** Maps Supabase errors to i18n keys without revealing whether an account exists. */
function toErrorKey(error: AuthError): string {
  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  ) {
    return "rateLimited";
  }
  if (error.code === "email_not_confirmed") return "emailNotConfirmed";
  if (error.code === "invalid_credentials") return "invalidCredentials";
  return "generic";
}

const notConfigured: ActionResult = { ok: false, error: "notConfigured" };
const rateLimited: ActionResult = { ok: false, error: "rateLimited" };
const captchaFailed: ActionResult = { ok: false, error: "captcha" };

export async function signInWithPassword(input: unknown, next?: string | null): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };
  if (!(await enforceRateLimit("auth")).ok) return rateLimited;
  if (!(await verifyCaptcha(parsed.data.turnstileToken)).ok) return captchaFailed;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: toErrorKey(error) };
  redirect(await defaultNext(next));
}

export async function signUpWithPassword(input: unknown, next?: string | null): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  if (!(await enforceRateLimit("auth")).ok) return rateLimited;
  if (!(await verifyCaptcha(parsed.data.turnstileToken)).ok) return captchaFailed;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: await callbackUrl(await defaultNext(next)),
    },
  });
  if (error) return { ok: false, error: toErrorKey(error) };
  // With email confirmation off (local dev), Supabase signs the user in at once.
  if (data.session) redirect(await defaultNext(next));
  return { ok: true, message: "signupSent" };
}

export async function sendMagicLink(input: unknown, next?: string | null): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidEmail" };
  // Also keyed by address, so one inbox can't be flooded from many IPs.
  if (!(await enforceRateLimit("auth", { key: parsed.data.email })).ok) return rateLimited;
  if (!(await verifyCaptcha(parsed.data.turnstileToken)).ok) return captchaFailed;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: await callbackUrl(await defaultNext(next)) },
  });
  if (error && toErrorKey(error) === "rateLimited") return { ok: false, error: "rateLimited" };
  return { ok: true, message: "magicSent" };
}

export async function signInWithGoogle(next?: string | null): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(await defaultNext(next)) },
  });
  if (error || !data.url) return { ok: false, error: "generic" };
  redirect(data.url);
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidEmail" };
  if (!(await enforceRateLimit("auth", { key: parsed.data.email })).ok) return rateLimited;
  if (!(await verifyCaptcha(parsed.data.turnstileToken)).ok) return captchaFailed;

  const supabase = await createClient();
  const target = localizedPath(await getLocale(), "/account/update-password");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await callbackUrl(target),
  });
  if (error && toErrorKey(error) === "rateLimited") return { ok: false, error: "rateLimited" };
  // Same answer whether or not the account exists.
  return { ok: true, message: "resetSent" };
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: toErrorKey(error) };
  return { ok: true, message: "passwordUpdated" };
}

export async function signOut(): Promise<void> {
  const locale = await getLocale();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(localizedPath(locale, "/"));
}
