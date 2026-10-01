import { expect, test } from "@playwright/test";

// CI has no Supabase, so the hotel catalog is empty: these cover the page
// shell, URL-driven state and access control. Search, pricing and filters
// are unit-tested in tests/unit/hotel-search.test.ts.

test("hotel listing renders the search bar, sorts and empty state", async ({ page }) => {
  await page.goto("/hotels");
  await expect(page.getByRole("heading", { level: 1, name: "Hotels and stays" })).toBeVisible();
  await expect(page.getByRole("search", { name: "Search hotels" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lowest price & best rated" })).toBeVisible();
  await expect(page.getByText("Hotels are coming soon")).toBeVisible();
});

test("searching writes the stay into the URL and keeps filters", async ({ page }) => {
  await page.goto("/hotels?couple=1&sort=price_asc");
  await page.getByLabel("City, area or property").fill("Vrindavan");
  await page.getByLabel("Adults").fill("3");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=Vrindavan/);
  await expect(page).toHaveURL(/adults=3/);
  await expect(page).toHaveURL(/couple=1/);
  await expect(page).toHaveURL(/sort=price_asc/);
});

test("sort links are URL driven", async ({ page }) => {
  await page.goto("/hotels");
  await page.getByRole("link", { name: "User rating" }).click();
  await expect(page).toHaveURL(/sort=rating/);
  await expect(page.getByRole("link", { name: "User rating" })).toHaveAttribute("aria-current", "true");
});

test("invalid query values are ignored instead of failing", async ({ page }) => {
  const res = await page.goto("/hotels?rooms=abc&checkin=2026-02-30&sort=nope&stars=x");
  expect(res?.status()).toBe(200);
});

test("hotel listing is available in Hindi", async ({ page }) => {
  await page.goto("/hi/hotels");
  await expect(page.getByRole("heading", { level: 1, name: "होटल और ठहरने की जगहें" })).toBeVisible();
});

test("unknown hotel slugs return 404", async ({ page }) => {
  const res = await page.goto("/hotels/not-a-hotel");
  expect(res?.status()).toBe(404);
});

test("home hotel search opens the listing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tabpanel").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/hotels\?/);
});

for (const path of ["/admin/hotels", "/admin/hotels/new"]) {
  test(`${path} requires sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("hotel CSV export refuses anonymous callers", async ({ request }) => {
  const res = await request.get("/api/admin/hotels/export");
  expect(res.status()).toBe(403);
});
