import "server-only";
import { headers } from "next/headers";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecuritySettings, type RateLimitRule } from "./settings";

/**
 * Fixed-window rate limiting for public endpoints (D-093). Each call counts
 * one hit against the visitor's IP and, when known, their user id (and an
 * optional extra key such as the email being signed in), and refuses once
 * any of those buckets is over the limit from `security.defaults.rate_limits`.
 *
 * Storage goes through a `RateLimiter` adapter: Upstash Redis (REST, no SDK)
 * when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, else the
 * database function hit_rate_limit via the service role. If neither is
 * available, or the limiter itself fails, requests are allowed (fail open):
 * a broken limiter must never take sign-in or bookings down.
 */

export type RateLimitAction = "auth" | "enquiry" | "coupon" | "partner" | "review" | "upload" | "export";

export type RateLimitHit = { allowed: boolean; retryAfter: number };

export interface RateLimiter {
  readonly name: string;
  /** Counts one hit for `bucket` in the current window. */
  hit(bucket: string, rule: RateLimitRule): Promise<RateLimitHit>;
}

// ---------------------------------------------------------------- adapters

/** Postgres adapter: public.hit_rate_limit (service role only). */
export function databaseRateLimiter(): RateLimiter {
  return {
    name: "database",
    async hit(bucket, rule) {
      const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
        p_bucket: bucket,
        p_limit: rule.limit,
        p_window_seconds: rule.window_seconds,
      });
      if (error) throw new Error(`hit_rate_limit failed: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error("hit_rate_limit returned no row");
      return { allowed: row.allowed, retryAfter: row.retry_after };
    },
  };
}

type UpstashReply = { result?: unknown; error?: string };

/**
 * Upstash Redis over its REST API (pipeline endpoint). The key carries the
 * window number, so INCR + EXPIRE give the same fixed window as the database.
 */
export function upstashRateLimiter(
  config: { url: string; token: string },
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): RateLimiter {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const base = config.url.replace(/\/+$/, "");
  return {
    name: "upstash",
    async hit(bucket, rule) {
      const nowSeconds = now() / 1000;
      const window = Math.floor(nowSeconds / rule.window_seconds);
      const key = `rl:${bucket}:${window}`;
      const res = await doFetch(`${base}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(rule.window_seconds + 5)],
        ]),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
      const replies = (await res.json()) as UpstashReply[];
      const count = Number(replies?.[0]?.result);
      if (!Number.isFinite(count)) throw new Error(`Upstash error: ${replies?.[0]?.error ?? "bad reply"}`);
      const allowed = count <= rule.limit;
      const retryAfter = allowed
        ? 0
        : Math.max(1, Math.ceil((window + 1) * rule.window_seconds - nowSeconds));
      return { allowed, retryAfter };
    },
  };
}

/** The adapter for this deployment, or null when no store is configured. */
export function defaultRateLimiter(): RateLimiter | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashRateLimiter({ url, token });
  if (hasServiceRole()) return databaseRateLimiter();
  return null;
}

// ---------------------------------------------------------------- core

export type RateLimitIdentity = { ip: string; userId?: string | null; key?: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Buckets for one request. The extra key (often an email address) is hashed
 * so no personal data sits in the limiter's store.
 */
export async function rateLimitBuckets(action: RateLimitAction, id: RateLimitIdentity): Promise<string[]> {
  const buckets = [`${action}:ip:${id.ip.slice(0, 64)}`];
  if (id.userId) buckets.push(`${action}:user:${id.userId}`);
  if (id.key) buckets.push(`${action}:key:${(await sha256Hex(id.key.trim().toLowerCase())).slice(0, 40)}`);
  return buckets;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/** Pure core, shared by enforceRateLimit and the unit tests. Fails open. */
export async function checkRateLimit(
  limiter: RateLimiter | null,
  action: RateLimitAction,
  rule: RateLimitRule,
  id: RateLimitIdentity,
): Promise<RateLimitResult> {
  if (!limiter) return { ok: true };
  try {
    const buckets = await rateLimitBuckets(action, id);
    const hits = await Promise.all(buckets.map((b) => limiter.hit(b, rule)));
    const blocked = hits.filter((h) => !h.allowed);
    if (blocked.length === 0) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, ...blocked.map((h) => h.retryAfter)) };
  } catch (error) {
    console.error(`[security] rate limiter (${limiter.name}) failed; allowing request`, error);
    return { ok: true };
  }
}

/**
 * The caller's IP. Vercel sets X-Vercel-Forwarded-For itself (clients can't
 * spoof it), then X-Real-IP; the first X-Forwarded-For hop is the fallback
 * for other hosts.
 */
export function clientIpFrom(h: Pick<Headers, "get">): string {
  const first = (name: string) => h.get(name)?.split(",")[0]?.trim() || null;
  return first("x-vercel-forwarded-for") ?? first("x-real-ip") ?? first("x-forwarded-for") ?? "unknown";
}

/**
 * Call at the top of a server action, after cheap input validation. On
 * `{ ok: false }` return the action's "rateLimited" error.
 */
export async function enforceRateLimit(
  action: RateLimitAction,
  opts?: { userId?: string | null; key?: string },
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  let limiter: RateLimiter | null;
  let rule: RateLimitRule;
  let ip: string;
  try {
    limiter = defaultRateLimiter();
    if (!limiter) return { ok: true };
    rule = (await getSecuritySettings()).rate_limits[action];
    ip = clientIpFrom(await headers());
  } catch (error) {
    console.error("[security] rate limit setup failed; allowing request", error);
    return { ok: true };
  }
  return checkRateLimit(limiter, action, rule, { ip, userId: opts?.userId, key: opts?.key });
}
