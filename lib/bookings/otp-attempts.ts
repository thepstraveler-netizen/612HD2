import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Tries allowed per trip, ride or order in each window before the OTP is locked (D-098). */
export const OTP_ATTEMPT_LIMIT = 5;
export const OTP_ATTEMPT_WINDOW_SECONDS = 15 * 60;

/**
 * Counts one OTP attempt for a trip, ride or order and says whether it may be
 * checked. 4-digit codes could otherwise be guessed by anyone holding a driver
 * or rider link (or the store itself). Counted in its own call so a failed
 * status change, which rolls back, still uses up an attempt. Fails open if
 * the limiter is unreachable, as the code check still runs.
 */
export async function otpAttemptAllowed(kind: "trip" | "ride" | "order", id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_bucket: `otp:${kind}:${id}`,
    p_limit: OTP_ATTEMPT_LIMIT,
    p_window_seconds: OTP_ATTEMPT_WINDOW_SECONDS,
  });
  if (error) {
    console.error("[otp] attempt limiter failed", error.message);
    return true;
  }
  return data?.[0]?.allowed ?? true;
}
