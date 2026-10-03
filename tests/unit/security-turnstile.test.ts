import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn, revalidateTag: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "x-real-ip" ? "7.7.7.7" : null) }),
}));
let settingsValue: unknown = undefined;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: settingsValue ? { value: settingsValue } : null }) }),
      }),
    }),
  }),
}));

import { TURNSTILE_VERIFY_URL, turnstileVerifier, verifyCaptcha } from "@/lib/security/turnstile";

const reply = (body: unknown, status = 200) =>
  vi.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    return new Response(JSON.stringify(body), { status });
  });

beforeEach(() => {
  settingsValue = undefined;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("turnstileVerifier", () => {
  it("posts secret, token and IP to siteverify and accepts success", async () => {
    const fetchMock = reply({ success: true });
    const v = turnstileVerifier("sec", { fetch: fetchMock as unknown as typeof fetch });
    expect(await v.verify("tok", "1.2.3.4")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const body = init?.body as URLSearchParams;
    expect(body.get("secret")).toBe("sec");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("rejects a failed or missing token", async () => {
    const v = turnstileVerifier("sec", {
      fetch: reply({ success: false, "error-codes": ["invalid-input-response"] }) as unknown as typeof fetch,
    });
    expect(await v.verify("bad")).toEqual({ ok: false, reason: "invalid" });
    expect(await v.verify("")).toEqual({ ok: false, reason: "missing" });
  });

  it("reports unavailable when Cloudflare can't be reached", async () => {
    const v = turnstileVerifier("sec", {
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(await v.verify("tok")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("verifyCaptcha", () => {
  it("is skipped when keys are absent", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const fetchMock = reply({ success: false });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha(undefined)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function configure() {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "sec");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  }

  it("is skipped when switched off in settings", async () => {
    configure();
    settingsValue = { turnstile_enabled: false };
    expect(await verifyCaptcha(undefined)).toEqual({ ok: true });
  });

  it("requires a valid token when configured", async () => {
    configure();
    expect(await verifyCaptcha(undefined)).toEqual({ ok: false, reason: "missing" });
    const fetchMock = reply({ success: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha("tok")).toEqual({ ok: true });
    expect((fetchMock.mock.calls[0][1]?.body as URLSearchParams).get("remoteip")).toBe("7.7.7.7");
    vi.stubGlobal("fetch", reply({ success: false }));
    expect(await verifyCaptcha("tok")).toEqual({ ok: false, reason: "invalid" });
  });

  it("lets visitors through when Cloudflare is down", async () => {
    configure();
    vi.stubGlobal("fetch", reply({}, 503));
    expect(await verifyCaptcha("tok")).toEqual({ ok: true });
  });
});
