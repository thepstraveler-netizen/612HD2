import { expect, test } from "@playwright/test";

/**
 * Acceptance guards that can run without Supabase or Razorpay (master prompt §15).
 * The money rules themselves are proven lower down:
 *   - server-side prices under tampering: tests/unit/acceptance-pricing.test.ts
 *   - double booking, webhook replays, RLS: tests/db/acceptance.test.ts
 *   - admin edits revalidating the public cache: tests/unit/acceptance-revalidation.test.ts
 * Here we check what a browser can see: checkout links drop forged price
 * parameters, and the two busiest public pages keep their accessibility and
 * loading budget (Phase 11 performance pass).
 */

test.describe("tampered checkout links", () => {
  for (const [path, keeps] of [
    [
      "/checkout/package?pkg=demo-braj-84-kos-yatra&adults=2&total=1&price=1&amount_paise=1",
      "/checkout/package",
    ],
    ["/cabs/review?type=one_way&pax=2&total=1&fare=1", "/cabs/review"],
    ["/rides/review?mode=point_to_point&total=1&fare=1", "/rides/review"],
    ["/checkout/order?total=1", "/checkout/order"],
  ] as const) {
    test(`${keeps} rebuilds its own query and drops forged prices`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
      const next = decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "");
      expect(next.startsWith(keeps)).toBe(true);
      expect(next).not.toMatch(/total|price|fare|amount/);
    });
  }
});

test.describe("home and hotel listing budget", () => {
  test("every field in the home search card has an accessible name", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("form").filter({ has: page.locator('input[name="checkin"]') });
    for (const name of ["q", "checkin", "checkout", "rooms", "adults"]) {
      const input = form.locator(`input[name="${name}"]`);
      // A wrapping <label> gives each input its visible caption as its name.
      expect(
        await input.evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0),
        name,
      ).toBeGreaterThan(0);
    }
    await expect(page.getByLabel(/check-in/i).first()).toBeVisible();
  });

  for (const path of ["/", "/hotels", "/hi"]) {
    test(`${path}: one h1, every image described, no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      const missingAlt = await page.locator("img:not([alt])").count();
      expect(missingAlt).toBe(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("the hotel list view does not load the map library", async ({ page }) => {
    const leaflet: string[] = [];
    page.on("response", async (res) => {
      const type = res.request().resourceType();
      if (type !== "script") return;
      const body = await res.text().catch(() => "");
      if (body.includes("leaflet-container") || body.includes("Leaflet 1.9")) leaflet.push(res.url());
    });
    await page.goto("/hotels");
    await page.waitForLoadState("networkidle");
    expect(leaflet).toEqual([]);
  });

  test("English pages do not preload the Devanagari font", async ({ page }) => {
    await page.goto("/");
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
    // Plus Jakarta Sans and Dancing Script only; Hindi text pulls its font on demand (unicode-range).
    expect(preloads.length).toBeLessThanOrEqual(2);
  });
});
