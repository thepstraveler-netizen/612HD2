import { expect, test } from "@playwright/test";

// CI has no Supabase (and no service role), so every rider link is unknown:
// this covers the public, no-login expired page in both languages. The
// rider's allowed steps are unit-tested in tests/unit/delivery-vendor.test.ts.

test("an unknown rider order link shows the expired page with a 404", async ({ page }) => {
  const res = await page.goto(`/delivery/order/${"0".repeat(48)}`);
  expect(res?.status()).toBe(404);
  await expect(page).toHaveURL(/\/delivery\/order\//);
  await expect(page.getByRole("heading", { name: "This delivery link has expired" })).toBeVisible();

  const hi = await page.goto("/hi/delivery/order/not-a-token");
  expect(hi?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "इस डिलीवरी का लिंक खत्म हो गया है" })).toBeVisible();
});
