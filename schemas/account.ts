import { z } from "zod";
import { phoneSchema } from "./booking";

/**
 * Customer account forms: profile, saved travellers and reward redemption.
 * Shared by the react-hook-form resolvers and the server actions, which
 * re-parse every input. Error messages are i18n keys under `account.errors`.
 */

const uuid = z.uuid();

/** Blank → null; otherwise a normalised phone (`+91…`). */
const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const parsed = phoneSchema.safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return parsed.data;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .transform((v) => (v ? v : null));

export const LOCALES = ["en", "hi"] as const;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, { error: "nameTooShort" }).max(120, { error: "tooLong" }),
  phone: optionalPhone,
  preferredLocale: z.enum(LOCALES),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** `YYYY-MM-DD`, after 1900 and not in the future; blank → null. */
export function isValidBirthDate(value: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value > "1900-01-01" && value <= today.toISOString().slice(0, 10);
}

export const travellerSchema = z.object({
  fullName: z.string().trim().min(2, { error: "nameTooShort" }).max(120, { error: "tooLong" }),
  relation: optionalText(40),
  dateOfBirth: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidBirthDate(v), { error: "invalidDate" })
    .transform((v) => (v ? v : null)),
  gender: z.union([z.enum(GENDERS), z.literal("")]).transform((v) => (v ? v : null)),
  phone: optionalPhone,
  isDefault: z.boolean().default(false),
});
export type TravellerInput = z.input<typeof travellerSchema>;
export type TravellerValues = z.output<typeof travellerSchema>;

export const travellerWithIdSchema = travellerSchema.extend({ id: uuid.optional() });
export const idSchema = z.object({ id: uuid });

export const redeemSchema = z.object({
  points: z.coerce.number({ error: "invalidPoints" }).int({ error: "invalidPoints" }).positive({
    error: "invalidPoints",
  }),
});
export type RedeemInput = z.input<typeof redeemSchema>;
