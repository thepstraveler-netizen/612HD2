import { expect, test } from "@playwright/test";

// Without Supabase env vars the site renders the offline fallback catalog,
// which mirrors the baseline content migration.

test("services index lists every published service", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main li a[href*='/services/']")).toHaveCount(14);
});

test("service pages render from the catalog", async ({ page }) => {
  await page.goto("/services/food");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("home shows the search card", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("tablist").first();
  await expect(search).toBeVisible();
});

test("unknown service slugs return 404", async ({ page }) => {
  const res = await page.goto("/services/not-a-service");
  expect(res?.status()).toBe(404);
});

for (const path of ["/admin/cms", "/admin/cms/services/new", "/admin/offers", "/admin/settings"]) {
  test(`${path} requires sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}
