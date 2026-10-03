import { expect, test, type Page } from "@playwright/test";

// CI has no Supabase: catalogs are empty, so detail pages 404 and nobody can
// sign in. These cover the access gates and, when the demo catalog is seeded,
// that the reviews section (or its empty state) renders on hotel, package and
// store pages. Schemas and helpers are unit-tested in tests/unit/reviews.test.ts.

const REVIEWS_HEADING = "Guest reviews";
const SUMMARY = /No reviews yet|\d+ reviews?/;

/** The first link on a listing page that opens a detail page (null when the catalog is empty). */
async function firstDetailHref(page: Page, list: string, pattern: RegExp): Promise<string | null> {
  await page.goto(list);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  return hrefs.find((h) => pattern.test(h)) ?? null;
}

for (const [list, pattern] of [
  ["/hotels", /^\/hotels\/[a-z0-9-]+/],
  ["/packages", /^\/packages\/[a-z0-9-]+$/],
  ["/food", /^\/food\/[a-z0-9-]+$/],
] as const) {
  test(`a detail page under ${list} shows the reviews section`, async ({ page }) => {
    const href = await firstDetailHref(page, list, pattern);
    test.skip(!href, "No seeded catalog (DB-less run)");
    await page.goto(href as string);
    await expect(page.getByRole("heading", { level: 2, name: REVIEWS_HEADING })).toBeVisible();
    await expect(page.locator("#reviews").getByText(SUMMARY).first()).toBeVisible();
  });
}

test("Hindi detail pages translate the reviews section", async ({ page }) => {
  const href = await firstDetailHref(page, "/hotels", /^\/hotels\/[a-z0-9-]+/);
  test.skip(!href, "No seeded catalog (DB-less run)");
  await page.goto(`/hi${href}`);
  await expect(page.getByRole("heading", { level: 2, name: "मेहमानों की समीक्षाएँ" })).toBeVisible();
});

for (const path of [
  "/admin/reviews",
  "/admin/reviews?status=all&rating=5",
  "/admin/reviews/9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  "/account/trips",
]) {
  test(`${path} requires sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}
