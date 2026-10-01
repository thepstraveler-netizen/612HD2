import { expect, test } from "@playwright/test";

// CI has no Supabase or Razorpay keys: these cover access control and the
// payment endpoints' refusals. Pricing, coupons, refunds and signatures are
// unit-tested; double booking and webhook idempotency are DB-tested.

test("checkout asks guests to sign in first and comes back afterwards", async ({ page }) => {
  await page.goto("/hotels/demo-prem-sarovar-hotel/book?checkin=2026-12-01&checkout=2026-12-02");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(page.url())).toContain("/hotels/demo-prem-sarovar-hotel/book?checkin=2026-12-01");
});

test("my trips is private", async ({ page }) => {
  await page.goto("/account/trips");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Ftrips/);
});

test("invoices need a signed-in owner", async ({ request }) => {
  const res = await request.get("/api/invoices/PS01234567");
  expect(res.status()).toBe(401);
});

test("the Razorpay webhook refuses unsigned events", async ({ request }) => {
  const res = await request.post("/api/webhooks/razorpay", {
    data: { event: "payment.captured", payload: {} },
    headers: { "x-razorpay-signature": "0".repeat(64) },
  });
  // 503 without a webhook secret configured; 400 when the signature is wrong.
  expect([400, 503]).toContain(res.status());
});
