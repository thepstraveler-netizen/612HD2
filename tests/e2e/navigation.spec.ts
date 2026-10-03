import { expect, test } from "@playwright/test";

test.describe("navigation speed guards", () => {
  test("reports the running build for the stale-tab check", async ({ request }) => {
    const res = await request.get("/api/version");
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = (await res.json()) as { build: unknown };
    expect(typeof body.build).toBe("string");
  });

  test("a link click moves to the next page without a full reload", async ({ page }) => {
    await page.goto("/hotels");
    await page.evaluate(() => {
      (window as unknown as { __stay: boolean }).__stay = true;
    });
    await page.locator('header a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    // Same document: the marker set before the click survives a client-side navigation.
    expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
  });
});
