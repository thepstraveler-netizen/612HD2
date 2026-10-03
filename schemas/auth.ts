import { z } from "zod";

/** Shared by the client forms (react-hook-form) and the server actions. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "invalidEmail" }));

/** Cloudflare Turnstile token from the form's widget; checked server-side only when configured. */
export const turnstileTokenSchema = z.string().trim().max(2048).optional();

const passwordSchema = z.string().min(8, { error: "passwordTooShort" }).max(72, { error: "passwordTooLong" });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }),
  turnstileToken: turnstileTokenSchema,
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, { error: "nameTooShort" }).max(120),
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: turnstileTokenSchema,
});

export const magicLinkSchema = z.object({ email: emailSchema, turnstileToken: turnstileTokenSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema, turnstileToken: turnstileTokenSchema });

export const updatePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "passwordsDontMatch", path: ["confirm"] });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

/** Result shape every auth action returns; `error` is an i18n key under `auth.errors`. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
