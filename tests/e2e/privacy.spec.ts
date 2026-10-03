import { expect, test } from "@playwright/test";

// CI has no Supabase: these cover access control for the privacy & security
// pages, the two-step code prompt, the data export endpoint and Settings →
// Security. MFA decisions, the export file's shape and the settings form are
// unit-tested in tests/unit/mfa-*.test.ts and tests/unit/privacy-export.test.ts.

for (const path of [
  "/account/security",
  "/hi/account/security",
  "/admin/settings",
  "/admin/customers/privacy",
]) {
  test(`${path} sends signed-out visitors to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("the two-step code prompt needs a signed-in user and keeps next", async ({ page }) => {
  await page.goto("/mfa?next=%2Fadmin%2Fbookings");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "")).toContain("/admin/bookings");
});

test("the code prompt ignores an off-site next", async ({ page }) => {
  await page.goto("/mfa?next=%2F%2Fevil.example");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(page.url()).not.toContain("evil.example");
});

test("the data export refuses signed-out requests", async ({ request }) => {
  const res = await request.get("/api/account/export");
  expect(res.status()).toBe(401);
  expect(res.headers()["content-disposition"]).toBeUndefined();
});
