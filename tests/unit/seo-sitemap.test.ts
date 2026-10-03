import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn, revalidateTag: () => undefined }));

type Result = { data: unknown[] | null; error: { message: string } | null };
const tables: Record<string, Result> = {};
let configured = true;

/** Minimal PostgREST-style builder: every filter returns itself, awaiting yields the table's rows. */
function builder(table: string) {
  const result = () => tables[table] ?? { data: [], error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => (configured ? { from: (table: string) => builder(table) } : null),
}));

const SITE = "https://thepstraveler.vercel.app";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  configured = true;
  for (const key of Object.keys(tables)) delete tables[key];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("robots", () => {
  it("allows the site, blocks private areas in both locales and links the sitemap", async () => {
    const { default: robots } = await import("@/app/robots");
    const out = robots();
    const rule = Array.isArray(out.rules) ? out.rules[0] : out.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    for (const path of [
      "/admin",
      "/account",
      "/vendor",
      "/driver",
      "/delivery",
      "/api",
      "/checkout",
      "/quote",
    ]) {
      expect(rule.disallow).toContain(path);
      expect(rule.disallow).toContain(`/hi${path}`);
    }
    expect(rule.disallow).not.toContain("/hotels");
    expect(out.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});

describe("buildSitemap", () => {
  it("emits one entry per locale with hreflang alternates and dedupes paths", async () => {
    const { buildSitemap } = await import("@/lib/seo/sitemap");
    const out = buildSitemap([
      { path: "/hotels/radha", lastModified: "2026-09-01T10:00:00Z", priority: 0.8 },
      { path: "/hotels/radha/" },
      { path: "/x", lastModified: "garbage" },
    ]);
    expect(out.map((e) => e.url)).toEqual([
      `${SITE}/hotels/radha`,
      `${SITE}/hi/hotels/radha`,
      `${SITE}/x`,
      `${SITE}/hi/x`,
    ]);
    expect(out[0].lastModified).toEqual(new Date("2026-09-01T10:00:00Z"));
    expect(out[2].lastModified).toBeUndefined();
    expect(out[1].alternates?.languages).toEqual({
      en: `${SITE}/hotels/radha`,
      hi: `${SITE}/hi/hotels/radha`,
      "x-default": `${SITE}/hotels/radha`,
    });
  });
});

describe("sitemap route", () => {
  it("lists static pages plus published hotels, packages, stores and services from the DB", async () => {
    tables.services = { data: [{ slug: "car", updated_at: "2026-09-02T00:00:00Z" }], error: null };
    tables.hotels = { data: [{ slug: "radha-residency", updated_at: "2026-09-03T00:00:00Z" }], error: null };
    tables.packages = { data: [{ slug: "braj-darshan", updated_at: "2026-09-04T00:00:00Z" }], error: null };
    tables.stores = {
      data: [
        { slug: "bhojanalaya", kind: "restaurant", updated_at: null },
        { slug: "kirana", kind: "grocery", updated_at: null },
        { slug: "chemist", kind: "pharmacy", updated_at: null },
      ],
      error: null,
    };
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of [
      "/",
      "/hotels",
      "/cabs",
      "/packages",
      "/partner",
      "/services/car",
      "/hotels/radha-residency",
      "/packages/braj-darshan",
      "/food/bhojanalaya",
      "/essentials/kirana",
    ]) {
      expect(urls).toContain(`${SITE}${path === "/" ? "/" : path}`);
      expect(urls).toContain(`${SITE}/hi${path === "/" ? "" : path}`);
    }
    // Pharmacies have no public page; the built-in service list is not used when the DB answers.
    expect(urls.some((u) => u.includes("chemist"))).toBe(false);
    expect(urls).not.toContain(`${SITE}/services/bike`);
  });

  it("falls back to static pages and the built-in services without Supabase", async () => {
    configured = false;
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE}/hotels`);
    expect(urls).toContain(`${SITE}/services/bike`);
    expect(urls.some((u) => u.includes("/hotels/"))).toBe(false);
  });

  it("survives a failing table", async () => {
    tables.hotels = { data: null, error: { message: "boom" } };
    tables.services = { data: null, error: { message: "boom" } };
    tables.packages = { data: [{ slug: "braj-darshan", updated_at: null }], error: null };
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE}/packages/braj-darshan`);
    expect(urls).toContain(`${SITE}/services/bike`);
  });
});
