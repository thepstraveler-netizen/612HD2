import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { BRAND, ICONS, isIconName, TRIPS_CACHE } from "@/lib/pwa/brand";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("web app manifest", () => {
  const m = manifest();

  it("is installable: names, standalone, start url and icons", () => {
    expect(m.name).toBe("The P & S Traveler Group");
    expect(m.short_name).toBe("P&S Traveler");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    const icons = m.icons ?? [];
    expect(icons.find((i) => i.sizes === "192x192")).toBeDefined();
    expect(icons.find((i) => i.sizes === "512x512" && i.purpose === "any")).toBeDefined();
    expect(icons.find((i) => i.purpose === "maskable")).toBeDefined();
  });

  it("uses the design tokens for its colours", () => {
    expect(css).toContain(`--brand-navy: ${m.theme_color}`);
    expect(css).toContain(`--brand-sky-soft: ${m.background_color}`);
  });

  it("only points at icons the icon route serves", () => {
    for (const icon of m.icons ?? []) {
      const name = icon.src.replace("/icons/", "");
      expect(isIconName(name), icon.src).toBe(true);
      expect(icon.sizes).toBe(
        `${ICONS[name as keyof typeof ICONS].size}x${ICONS[name as keyof typeof ICONS].size}`,
      );
    }
    expect(isIconName("apple-touch-icon.png")).toBe(true);
    expect(isIconName("../secret")).toBe(false);
    expect(isIconName("toString")).toBe(false);
  });

  it("keeps brand colours in sync with globals.css", () => {
    expect(css).toContain(`--brand-navy-deep: ${BRAND.navyDeep}`);
    expect(css).toContain(`--brand-blue: ${BRAND.blue}`);
  });
});

describe("service worker", () => {
  it("uses the same trips cache name as the sign-out cleanup", () => {
    expect(sw).toContain(`const TRIPS_CACHE = "${TRIPS_CACHE}"`);
  });

  it("precaches both offline pages and never handles private routes", () => {
    expect(sw).toContain('"/offline"');
    expect(sw).toContain('"/hi/offline"');
    const never = /const NEVER = (\/.*\/);/.exec(sw);
    expect(never).not.toBeNull();
    const pattern = new RegExp(never![1].slice(1, -1));
    for (const path of [
      "/api/x",
      "/admin",
      "/hi/admin/hotels",
      "/auth/callback",
      "/checkout/order",
      "/hi/checkout",
    ]) {
      expect(pattern.test(path), path).toBe(true);
    }
    for (const path of ["/hotels", "/account/trips/PS1", "/checkouts-guide"]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });

  it("recognises trip pages in both locales", () => {
    const trip = /const TRIP_PAGE = (\/.*\/);/.exec(sw);
    const pattern = new RegExp(trip![1].slice(1, -1));
    expect(pattern.test("/account/trips/PS-HTL-1")).toBe(true);
    expect(pattern.test("/hi/account/trips/PS-HTL-1")).toBe(true);
    expect(pattern.test("/account/trips")).toBe(false);
    expect(pattern.test("/account/trips/PS-1/review")).toBe(false);
  });
});
