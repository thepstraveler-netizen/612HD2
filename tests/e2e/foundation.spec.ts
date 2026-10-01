import { expect, test } from "@playwright/test";

test("home renders in English with all 14 services", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your One Stop Travel & Service Partner");
  await expect(page.locator("#services li")).toHaveCount(14);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Hindi lives under /hi", async ({ page }) => {
  await page.goto("/hi");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("आपका वन स्टॉप ट्रैवल और सर्विस पार्टनर");
});

test("language switcher keeps the current page", async ({ page }) => {
  await page.goto("/services/car");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "हिन्दी" }).click();
  await expect(page).toHaveURL(/\/hi\/services\/car$/);
});

for (const path of ["/admin", "/account", "/vendor", "/driver", "/hi/admin/hotels"]) {
  test(`${path} redirects signed-out users to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("unknown pages return 404", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
});
