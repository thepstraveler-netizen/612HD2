import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactAnalyticsUrl } from "@/lib/analytics";
import { pageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, languageAlternates, normalizePath, ogImageUrl, siteUrl } from "@/lib/seo/site";

const SITE = "https://thepstraveler.vercel.app";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`));
afterEach(() => vi.unstubAllEnvs());

describe("site urls", () => {
  it("strips the trailing slash and falls back to localhost", () => {
    expect(siteUrl()).toBe(SITE);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("normalises paths", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("hotels/x/")).toBe("/hotels/x");
  });

  it("prefixes Hindi but not English", () => {
    expect(absoluteUrl("/", "en")).toBe(`${SITE}/`);
    expect(absoluteUrl("/", "hi")).toBe(`${SITE}/hi`);
    expect(absoluteUrl("/hotels/radha", "hi")).toBe(`${SITE}/hi/hotels/radha`);
  });

  it("lists en, hi and x-default alternates", () => {
    expect(languageAlternates("/cabs")).toEqual({
      en: `${SITE}/cabs`,
      hi: `${SITE}/hi/cabs`,
      "x-default": `${SITE}/cabs`,
    });
  });

  it("builds OG image urls", () => {
    expect(ogImageUrl("hotel", "radha-residency")).toBe(`${SITE}/og/hotel/radha-residency.png`);
  });
});

describe("pageMetadata", () => {
  it("sets the canonical for the current locale and hreflang for all", () => {
    const meta = pageMetadata({ locale: "hi", path: "/hotels", title: "होटल", description: "d" });
    expect(meta.alternates?.canonical).toBe(`${SITE}/hi/hotels`);
    expect(meta.alternates?.languages).toEqual({
      en: `${SITE}/hotels`,
      hi: `${SITE}/hi/hotels`,
      "x-default": `${SITE}/hotels`,
    });
    expect(meta.title).toBe("होटल");
    expect(meta.description).toBe("d");
    expect(meta.openGraph).toMatchObject({
      url: `${SITE}/hi/hotels`,
      locale: "hi_IN",
      alternateLocale: ["en_IN"],
      siteName: "द पी एंड एस ट्रैवलर ग्रुप",
    });
  });

  it("uses the default OG image unless images are given", () => {
    const fallback = pageMetadata({ locale: "en", path: "/" });
    expect(fallback.openGraph?.images).toEqual([`${SITE}/og/default.png`]);
    expect(fallback.title).toBeUndefined();
    const custom = pageMetadata({ locale: "en", path: "/x", images: ["https://cdn/x.jpg"] });
    expect(custom.openGraph?.images).toEqual(["https://cdn/x.jpg"]);
    expect(custom.twitter).toMatchObject({ card: "summary_large_image", images: ["https://cdn/x.jpg"] });
  });

  it("can mark a page noindex", () => {
    expect(pageMetadata({ locale: "en", path: "/x", noIndex: true }).robots).toEqual({
      index: false,
      follow: true,
    });
  });
});

describe("analytics url redaction", () => {
  it("hides tokens, booking codes and query strings", () => {
    expect(redactAnalyticsUrl("https://x.app/hi/quote/abc123?utm=1#top")).toBe(
      "https://x.app/hi/quote/[token]",
    );
    expect(redactAnalyticsUrl("https://x.app/account/trips/PS-HTL-1234")).toBe(
      "https://x.app/account/trips/[code]",
    );
    expect(redactAnalyticsUrl("https://x.app/hotels?q=vrindavan")).toBe("https://x.app/hotels");
    expect(redactAnalyticsUrl("not a url")).toBe("not a url");
  });
});
