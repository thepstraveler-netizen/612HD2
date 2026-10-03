import { expect, test } from "@playwright/test";

// CI has no Supabase: services come from the offline fallback catalog with
// no plans or portfolio, so the B2B pages must render exactly as before
// (heading, enquiry form, no plan select). With a seeded database
// (supabase/seed.sql) the pricing cards show and "Choose this plan"
// preselects the plan in the form. Helpers and schemas are unit-tested in
// tests/unit/service-b2b.test.ts.

const B2B = ["hotel-photography", "ota-handling", "calling-centre", "instagram-marketing", "lead-generation"];

for (const slug of B2B) {
  test(`/services/${slug} renders its enquiry form with or without plans`, async ({ page }) => {
    await page.goto(`/services/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const form = page.getByRole("form", { name: "Enquiry form" });
    await expect(form).toBeVisible();
    const plans = page.getByRole("heading", { level: 2, name: "Plans and pricing" });
    const planSelect = form.getByLabel("Plan");
    if ((await plans.count()) === 0) {
      await expect(planSelect).toHaveCount(0);
    } else {
      await expect(planSelect).toBeVisible();
      await expect(planSelect).toHaveValue("");
    }
  });
}

test("choosing a plan preselects it in the enquiry form", async ({ page }) => {
  await page.goto("/services/hotel-photography");
  const choose = page.getByRole("link", { name: /^Choose this plan/ });
  test.skip((await choose.count()) === 0, "No seeded plans (DB-less run)");

  await expect(page.getByText("Most chosen")).toBeVisible();
  await choose.last().click();
  const select = page.getByRole("form", { name: "Enquiry form" }).getByLabel("Plan");
  await expect(select).not.toHaveValue("");
  await expect(select).toBeFocused();
  await expect(select.locator("option:checked")).toContainText("Listing booster");
});

test("the Hindi B2B page renders in Hindi", async ({ page }) => {
  await page.goto("/hi/services/ota-handling");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "पूछताछ भेजें" })).toBeVisible();
});

test("bookable service pages show no pricing or portfolio", async ({ page }) => {
  await page.goto("/services/food");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plans and pricing" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Our work" })).toHaveCount(0);
});
