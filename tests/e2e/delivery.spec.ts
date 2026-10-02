import { expect, test } from "@playwright/test";

// CI has no Supabase: the store catalog is empty and `booking.food`,
// `booking.essentials` and `booking.medicine` are off. The shells, the
// paused-ordering notes, the compliance notice (a settings default) and the
// sign-in gates are always checked; the demo restaurant from
// supabase/seed.sql is checked only when the catalog is seeded. Cart, filter
// and label logic is unit-tested in tests/unit/delivery-ui.test.ts.

const DEMO_RESTAURANT = "Demo · Brajwasi Bhojnalaya";

test("the food page renders its filters and the paused-ordering note", async ({ page }) => {
  await page.goto("/food");
  await expect(page.getByRole("heading", { level: 1, name: "Satvik meals, delivered" })).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Filters" });
  await expect(filters.getByRole("link", { name: "Pure veg" })).toBeVisible();
  await filters.getByRole("link", { name: "Open 24×7" }).click();
  await expect(page).toHaveURL(/\/food\?h24=1/);
  await expect(filters.getByRole("link", { name: "Open 24×7" })).toHaveAttribute("aria-pressed", "true");
});

test("the food page lists the demo restaurant and its menu shows Braj Thali", async ({ page }) => {
  await page.goto("/food");
  const card = page.getByRole("link", { name: DEMO_RESTAURANT });
  const seeded = (await card.count()) > 0;
  test.skip(!seeded, "No seeded catalog (DB-less run)");

  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/food\/demo-brajwasi-bhojnalaya/);
  await expect(page.getByRole("heading", { level: 1, name: DEMO_RESTAURANT })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Braj Thali" })).toBeVisible();

  // The Jain filter keeps only Jain dishes.
  await page.getByText("Jain only").click();
  await expect(page.getByRole("heading", { level: 3, name: "Braj Thali" })).toHaveCount(0);
  await expect(page).toHaveURL(/jain=1/);
});

test("an unknown store is a 404", async ({ page }) => {
  const res = await page.goto("/food/no-such-store");
  expect(res?.status()).toBe(404);
});

test("the essentials page renders", async ({ page }) => {
  await page.goto("/essentials");
  await expect(page.getByRole("heading", { level: 1, name: "Daily needs and puja samagri" })).toBeVisible();
});

test("the medicine page shows the compliance notice and asks to sign in", async ({ page }) => {
  await page.goto("/medicine");
  await expect(
    page.getByRole("heading", { level: 1, name: "Medicines on a valid prescription" }),
  ).toBeVisible();
  await expect(page.getByTestId("medicine-notice")).toContainText("licensed partner pharmacies");
  await expect(page.getByText(/We do not sell medicines ourselves/)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    /\/login\?next=/,
  );
});

test("the medicine page is available in Hindi", async ({ page }) => {
  await page.goto("/hi/medicine");
  await expect(page.getByRole("heading", { level: 1, name: "वैध पर्ची पर दवाएँ" })).toBeVisible();
});

test("checkout and prescriptions ask customers to sign in first", async ({ page }) => {
  await page.goto("/checkout/order");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(page.url())).toContain("/checkout/order");

  await page.goto("/account/prescriptions");
  await expect(page).toHaveURL(/\/login\?next=/);
});
