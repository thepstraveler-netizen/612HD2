import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn, revalidateTag: () => undefined }));

const headerMap = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerMap.get(name) ?? null }),
}));

let settingsValue: unknown = undefined;
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: settingsValue ? { value: settingsValue } : null }) }),
      }),
    }),
    rpc,
  }),
}));

import {
  checkRateLimit,
  clientIpFrom,
  enforceRateLimit,
  rateLimitBuckets,
  upstashRateLimiter,
  type RateLimiter,
} from "@/lib/security/rate-limit";
import { DEFAULT_RATE_LIMITS, parseSecuritySettings } from "@/lib/security/settings";

/** In-memory fixed-window limiter. */
function fakeLimiter(): RateLimiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    name: "fake",
    counts,
    async hit(bucket, rule) {
      const n = (counts.get(bucket) ?? 0) + 1;
      counts.set(bucket, n);
      return { allowed: n <= rule.limit, retryAfter: n <= rule.limit ? 0 : rule.window_seconds };
    },
  };
}

const rule = { limit: 2, window_seconds: 60 };

beforeEach(() => {
  headerMap.clear();
  settingsValue = undefined;
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then refuses with retryAfter", async () => {
    const limiter = fakeLimiter();
    const id = { ip: "1.2.3.4" };
    expect(await checkRateLimit(limiter, "enquiry", rule, id)).toEqual({ ok: true });
    expect(await checkRateLimit(limiter, "enquiry", rule, id)).toEqual({ ok: true });
    expect(await checkRateLimit(limiter, "enquiry", rule, id)).toEqual({ ok: false, retryAfter: 60 });
    // Another IP and another action have their own buckets.
    expect(await checkRateLimit(limiter, "enquiry", rule, { ip: "5.6.7.8" })).toEqual({ ok: true });
    expect(await checkRateLimit(limiter, "coupon", rule, id)).toEqual({ ok: true });
  });

  it("counts the user across IPs", async () => {
    const limiter = fakeLimiter();
    await checkRateLimit(limiter, "upload", rule, { ip: "a", userId: "u1" });
    await checkRateLimit(limiter, "upload", rule, { ip: "b", userId: "u1" });
    const third = await checkRateLimit(limiter, "upload", rule, { ip: "c", userId: "u1" });
    expect(third.ok).toBe(false);
  });

  it("hashes the extra key so no email is stored", async () => {
    const buckets = await rateLimitBuckets("auth", { ip: "1.1.1.1", key: "Priya@Example.com" });
    expect(buckets[0]).toBe("auth:ip:1.1.1.1");
    expect(buckets[1]).toMatch(/^auth:key:[0-9a-f]{40}$/);
    expect(buckets.join()).not.toContain("example");
    expect(await rateLimitBuckets("auth", { ip: "x", key: "priya@example.com" })).toContain(buckets[1]);
  });

  it("fails open when the limiter throws", async () => {
    const broken: RateLimiter = {
      name: "broken",
      hit: async () => {
        throw new Error("down");
      },
    };
    expect(await checkRateLimit(broken, "auth", rule, { ip: "1.1.1.1" })).toEqual({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("allows everything without a limiter", async () => {
    expect(await checkRateLimit(null, "auth", rule, { ip: "1.1.1.1" })).toEqual({ ok: true });
  });
});

describe("clientIpFrom", () => {
  const h = (values: Record<string, string>) => ({ get: (n: string) => values[n] ?? null });
  it("prefers Vercel's header, then X-Real-IP, then the first forwarded hop", () => {
    expect(
      clientIpFrom(
        h({ "x-vercel-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }),
      ),
    ).toBe("9.9.9.9");
    expect(clientIpFrom(h({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }))).toBe("8.8.8.8");
    expect(clientIpFrom(h({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientIpFrom(h({}))).toBe("unknown");
  });
});

describe("upstashRateLimiter", () => {
  it("INCRs a per-window key and reports retryAfter once over the limit", async () => {
    let count = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      count += 1;
      const body = JSON.parse(String(init?.body)) as string[][];
      expect(body[0][0]).toBe("INCR");
      expect(body[0][1]).toBe("rl:auth:ip:1.1.1.1:1000");
      return new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 });
    });
    const limiter = upstashRateLimiter(
      { url: "https://example.upstash.io/", token: "t" },
      { fetch: fetchMock as unknown as typeof fetch, now: () => 60_000 * 1000 + 15_000 },
    );
    expect(await limiter.hit("auth:ip:1.1.1.1", rule)).toEqual({ allowed: true, retryAfter: 0 });
    await limiter.hit("auth:ip:1.1.1.1", rule);
    expect(await limiter.hit("auth:ip:1.1.1.1", rule)).toEqual({ allowed: false, retryAfter: 45 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.upstash.io/pipeline");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("throws on an error reply (so checkRateLimit fails open)", async () => {
    const limiter = upstashRateLimiter(
      { url: "https://x", token: "t" },
      { fetch: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch },
    );
    await expect(limiter.hit("b:c", rule)).rejects.toThrow();
  });
});

describe("enforceRateLimit", () => {
  it("allows when no limiter is configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    expect(await enforceRateLimit("auth")).toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the database limiter with the configured rule and IP", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    settingsValue = { rate_limits: { coupon: { limit: 7, window_seconds: 120 } } };
    headerMap.set("x-real-ip", "4.4.4.4");
    rpc.mockResolvedValue({ data: [{ allowed: false, hits: 8, retry_after: 33 }], error: null });
    expect(await enforceRateLimit("coupon", { userId: "u1" })).toEqual({ ok: false, retryAfter: 33 });
    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", {
      p_bucket: "coupon:ip:4.4.4.4",
      p_limit: 7,
      p_window_seconds: 120,
    });
    expect(rpc).toHaveBeenCalledWith(
      "hit_rate_limit",
      expect.objectContaining({ p_bucket: "coupon:user:u1" }),
    );
  });

  it("fails open when the database errors", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await enforceRateLimit("auth")).toEqual({ ok: true });
  });
});

describe("security settings", () => {
  it("falls back per rule and overall", () => {
    expect(parseSecuritySettings(undefined).rate_limits).toEqual(DEFAULT_RATE_LIMITS);
    const s = parseSecuritySettings({
      turnstile_enabled: false,
      rate_limits: { auth: { limit: 0, window_seconds: 10 }, enquiry: { limit: 3, window_seconds: 60 } },
    });
    expect(s.turnstile_enabled).toBe(false);
    expect(s.rate_limits.auth).toEqual(DEFAULT_RATE_LIMITS.auth);
    expect(s.rate_limits.enquiry).toEqual({ limit: 3, window_seconds: 60 });
    expect(s.rate_limits.export).toEqual(DEFAULT_RATE_LIMITS.export);
  });
});
