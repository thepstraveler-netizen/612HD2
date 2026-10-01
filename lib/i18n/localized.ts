import { z } from "zod";
import type { LocalizedJson } from "@/types/database";

export type { LocalizedJson };

/** Picks the text for `locale`, falling back to English when Hindi is missing. */
export function pickLocalized(value: LocalizedJson | null | undefined, locale: string): string {
  if (!value) return "";
  const localized = (value as Record<string, string | null | undefined>)[locale];
  return localized && localized.trim() ? localized : value.en;
}

/** True when the Hindi translation is missing (admin shows a hint). */
export function missingTranslation(value: LocalizedJson | null | undefined): boolean {
  return Boolean(value?.en) && !value?.hi?.trim();
}

/** Mirrors Postgres public.is_localized(): English required, Hindi optional. */
export const localizedSchema = z.object({
  en: z.string().trim().min(1, { error: "required" }).max(2000),
  hi: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const optionalLocalizedSchema = z
  .object({ en: z.string().trim().max(2000), hi: z.string().trim().max(2000).optional().nullable() })
  .nullable()
  .optional()
  .transform((v) => (v && v.en ? { en: v.en, hi: v.hi || null } : null));
