import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    }),
  );
}

describe("buildCsp", () => {
  const prod = directives(
    buildCsp({
      isDev: false,
      upgradeInsecure: true,
      supabaseUrl: "https://abc.supabase.co",
      sentryDsn: "https://key@o123.ingest.sentry.io/456",
    }),
  );

  it("locks down the basics", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["worker-src"]).toEqual(["'self'"]);
    expect(prod["manifest-src"]).toEqual(["'self'"]);
    expect(prod["upgrade-insecure-requests"]).toEqual([]);
  });

  it("allows the third parties the site uses", () => {
    expect(prod["script-src"]).toEqual(
      expect.arrayContaining([
        "'self'",
        "'unsafe-inline'",
        "https://checkout.razorpay.com",
        "https://challenges.cloudflare.com",
        "https://va.vercel-scripts.com",
      ]),
    );
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(prod["connect-src"]).toEqual(
      expect.arrayContaining([
        "https://abc.supabase.co",
        "wss://abc.supabase.co",
        "https://api.razorpay.com",
        "https://lumberjack.razorpay.com",
        "https://vitals.vercel-insights.com",
        "https://challenges.cloudflare.com",
        "https://o123.ingest.sentry.io",
      ]),
    );
    expect(prod["frame-src"]).toEqual(
      expect.arrayContaining([
        "https://api.razorpay.com",
        "https://checkout.razorpay.com",
        "https://challenges.cloudflare.com",
      ]),
    );
    expect(prod["img-src"]).toEqual(["'self'", "data:", "blob:", "https:"]);
  });

  it("never leaks the Sentry key into the header", () => {
    const csp = buildCsp({ isDev: false, sentryDsn: "https://secretkey@o1.ingest.sentry.io/2" });
    expect(csp).not.toContain("secretkey");
  });

  it("adds eval and hot-reload sockets only in development, and no upgrade", () => {
    const dev = directives(buildCsp({ isDev: true, upgradeInsecure: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
    expect(dev["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("skips missing or invalid origins", () => {
    const csp = directives(buildCsp({ isDev: false, supabaseUrl: "not a url", sentryDsn: "" }));
    expect(csp["connect-src"].every((v) => v !== "null" && v !== "")).toBe(true);
    expect(csp["upgrade-insecure-requests"]).toBeUndefined();
  });
});
