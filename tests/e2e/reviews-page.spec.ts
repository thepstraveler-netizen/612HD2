import { expect, test } from "@playwright/test";

test("reviews page is linked from the header and lists reviews or an empty note", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page.getByRole("heading", { level: 1, name: "Customer reviews" })).toBeVisible();
  await expect(page.getByText(/No reviews yet|Rated \d/).first()).toBeVisible();
});

test("header links to the reviews page", async ({ page, isMobile }) => {
  test.skip(isMobile, "the header links sit in the menu on phones");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Reviews" }),
  ).toHaveAttribute("href", "/reviews");
});
