import { expect, test } from "@playwright/test";

// CI has no Supabase: these cover access control, the referral cookie and
// the signed-out wishlist path. Points, referrals and coupon rules are
// unit-tested in tests/unit/account.test.ts and tests/db/engagement.test.ts.

for (const path of [
  "/account",
  "/account/wishlist",
  "/account/rewards",
  "/account/refer",
  "/account/travellers",
  "/account/addresses",
  "/account/profile",
  "/hi/account/rewards",
]) {
  test(`${path} sends signed-out visitors to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("a ?ref link stores the referral code in a first-party cookie", async ({ page, context }) => {
  await page.goto("/?ref=ab12cd34");
  const cookie = (await context.cookies()).find((c) => c.name === "ps_ref");
  expect(cookie?.value).toBe("AB12CD34");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  // ~30 days.
  expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(29 * 24 * 3600);
});

test("a malformed ?ref is ignored", async ({ page, context }) => {
  await page.goto("/hotels?ref=<x>");
  expect((await context.cookies()).some((c) => c.name === "ps_ref")).toBe(false);
});

test("the Hindi site captures ?ref too", async ({ page, context }) => {
  await page.goto("/hi?ref=ZX98QW76");
  expect((await context.cookies()).find((c) => c.name === "ps_ref")?.value).toBe("ZX98QW76");
});

test("the wishlist heart on a hotel card sends signed-out visitors to login", async ({ page }) => {
  await page.goto("/hotels");
  const heart = page.locator('[data-wishlist="hotel"]').first();
  test.skip((await heart.count()) === 0, "No hotels without a database");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(page).toHaveURL(/\/login\?next=%2Fhotels/);
});
