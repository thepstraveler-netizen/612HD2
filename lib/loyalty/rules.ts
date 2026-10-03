import { z } from "zod";
import type { Database } from "@/types/database";

/**
 * P&S Rewards rules that the browser and server share (D-085). Pure: the
 * database functions are the source of truth and re-check everything.
 */

export type LoyaltyKind = Database["public"]["Enums"]["loyalty_kind"];

/** `loyalty.defaults`. Missing keys fall back to the same values the SQL uses. */
export const loyaltySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  point_value_paise: z.number().int().min(1).default(100),
  earn_bps: z.number().int().min(0).max(10_000).default(100),
  earn_services: z.array(z.string()).default([]),
  min_redeem_points: z.number().int().min(1).default(1),
  max_redeem_points: z.number().int().min(1).nullable().default(null),
  code_valid_days: z.number().int().min(1).default(30),
  expiry_days: z.number().int().min(0).default(365),
  review_points: z.number().int().min(0).default(0),
  referrals_enabled: z.boolean().default(false),
  referrer_points: z.number().int().min(0).default(0),
  referee_points: z.number().int().min(0).default(0),
});
export type LoyaltySettings = z.output<typeof loyaltySettingsSchema>;

export function parseLoyaltySettings(value: unknown): LoyaltySettings {
  const parsed = loyaltySettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : loyaltySettingsSchema.parse({});
}

/** What `points` are worth, in paise. */
export function pointsToPaise(points: number, settings: Pick<LoyaltySettings, "point_value_paise">): number {
  return Math.max(0, Math.trunc(points)) * settings.point_value_paise;
}

/** `100` basis points → `1`; `250` → `2.5` (percent of a booking earned back). */
export function earnPercent(earnBps: number): number {
  return Math.round(earnBps) / 100;
}

export type RedeemBounds = { min: number; max: number; step: 1; canRedeem: boolean };

/** Smallest and largest redemption right now, given the balance. */
export function redeemBounds(
  balance: number,
  settings: Pick<LoyaltySettings, "min_redeem_points" | "max_redeem_points">,
): RedeemBounds {
  const min = settings.min_redeem_points;
  const max = Math.max(0, Math.min(settings.max_redeem_points ?? balance, balance));
  return { min, max, step: 1, canRedeem: max >= min };
}

export const REDEEM_ERRORS = [
  "invalid",
  "loyalty_disabled",
  "below_minimum",
  "above_maximum",
  "insufficient_points",
] as const;
export type RedeemError = (typeof REDEEM_ERRORS)[number];

/** Client and server pre-check; `redeem_points` repeats it under a lock. */
export function validateRedeem(
  points: number,
  balance: number,
  settings: Pick<LoyaltySettings, "enabled" | "min_redeem_points" | "max_redeem_points">,
): RedeemError | null {
  if (!settings.enabled) return "loyalty_disabled";
  if (!Number.isInteger(points) || points <= 0) return "invalid";
  if (points < settings.min_redeem_points) return "below_minimum";
  if (settings.max_redeem_points !== null && points > settings.max_redeem_points) return "above_maximum";
  if (points > balance) return "insufficient_points";
  return null;
}

/** Maps a Postgres exception message from `redeem_points` to a known error. */
export function toRedeemError(message: string | null | undefined): RedeemError | "unknown" {
  const hit = REDEEM_ERRORS.find((e) => e !== "invalid" && (message ?? "").includes(e));
  return hit ?? "unknown";
}

/** i18n key under `rewards.kinds` for a ledger row. */
export function ledgerLabelKey(kind: LoyaltyKind, points: number): string {
  if (kind === "adjust") return points > 0 ? "adjustCredit" : "adjustDebit";
  return kind;
}

/** The reward code a `redeem` row names in its note ("Reward code PSR…"). */
export function rewardCodeFromNote(note: string | null | undefined): string | null {
  const match = /\bPSR[0-9A-F]{8}\b/.exec(note ?? "");
  return match ? match[0] : null;
}

export type LedgerEntry = {
  id: string;
  kind: LoyaltyKind;
  points: number;
  createdAt: string;
  expiresAt: string | null;
  bookingCode: string | null;
  rewardCode: string | null;
  /** Staff reason for an adjustment, shown as written. */
  note: string | null;
};
