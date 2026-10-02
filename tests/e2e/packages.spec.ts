import { expect, test } from "@playwright/test";

// CI has no Supabase: the package catalog is empty, `booking.packages` is
// off and enquiries answer "unavailable". These cover the page shells, the
// empty states, the enquiry forms' own validation, the travel mode deep
// links, the public quote page's 404 and the checkout's sign-in gate; the
// demo tours from supabase/seed.sql are checked only when the catalog is
// seeded. Pure helpers are unit-tested in tests/unit/packages-ui.test.ts.

const DEMO_TOUR = "Demo · Braj 84 Kos Yatra";

test("the packages page renders its heading and an empty or filled listing", async ({ page }) => {
  await page.goto("/packages");
  await expect(
    page.getByRole("heading", { level: 1, name: "Yatras and tours, planned for you" }),
  ).toBeVisible();
  await expect(page.getByText(/New tours are on the way|\d+ tours?/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Want a tour made just for you?" })).toBeVisible();
});

test("a seeded tour shows its itinerary, prices and enquiry form", async ({ page }) => {
  await page.goto("/packages");
  const card = page.getByRole("link", { name: DEMO_TOUR });
  test.skip((await card.count()) === 0, "No seeded catalog (DB-less run)");

  await card.click();
  await expect(page).toHaveURL(/\/packages\/demo-braj-84-kos-yatra/);
  await expect(page.getByRole("heading", { level: 1, name: DEMO_TOUR })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Day-by-day plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Price per person" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Departures" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Enquiry form" })).toBeVisible();
});

test("an unknown tour is a 404", async ({ page }) => {
  const res = await page.goto("/packages/no-such-tour");
  expect(res?.status()).toBe(404);
});

test("the travel page opens the mode from the link and keeps it in the URL", async ({ page }) => {
  await page.goto("/travel?mode=train&from=Delhi");
  await expect(
    page.getByRole("heading", { level: 1, name: "Flights, trains and buses to Braj and beyond" }),
  ).toBeVisible();
  await expect(page.getByTestId("travel-notice")).toBeVisible();
  const modes = page.getByRole("group", { name: "Travel by" });
  await expect(modes.getByRole("button", { name: "Train" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("From")).toHaveValue("Delhi");
  await expect(page.getByLabel("Class")).toContainText("AC 3-tier (3A)");

  await modes.getByRole("button", { name: "Bus" }).click();
  await expect(page).toHaveURL(/mode=bus/);
  await expect(page.getByLabel("Class")).toContainText("AC sleeper");
  // The cities survive the switch.
  await expect(page.getByLabel("From")).toHaveValue("Delhi");
});

test("the travel enquiry explains what's missing before sending", async ({ page }) => {
  await page.goto("/travel");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("This is required.").first()).toBeVisible();
  await expect(page.getByText("Enter a valid mobile number.")).toBeVisible();
});

test("the travel page is available in Hindi", async ({ page }) => {
  await page.goto("/hi/travel");
  await expect(
    page.getByRole("heading", { level: 1, name: "ब्रज और आगे के लिए फ़्लाइट, ट्रेन और बस" }),
  ).toBeVisible();
});

test("an enquiry-only service page has the enquiry form", async ({ page }) => {
  await page.goto("/services/hotel-photography");
  const form = page.getByRole("form", { name: "Enquiry form" });
  await expect(form).toBeVisible();
  await form.getByLabel("Your name").fill("Radha Sharma");
  await form.getByLabel("Mobile number").fill("9876543210");
  await form.getByRole("button", { name: "Send enquiry" }).click();
  // Without a database the server can't store the lead and says so.
  await expect(
    page.getByText(/Enquiries can't be sent right now|Thank you! Your enquiry is with us./),
  ).toBeVisible();
});

test("the travel service pages hand over to packages and travel", async ({ page }) => {
  await page.goto("/services/travel-agent");
  await expect(page.getByRole("link", { name: "Plan your travel" })).toHaveAttribute("href", /\/travel$/);
  await expect(page.getByRole("link", { name: "See tour packages" })).toHaveAttribute("href", /\/packages$/);
});

test("the quote page is public and an unknown link is a 404", async ({ page }) => {
  const res = await page.goto(`/quote/${"a".repeat(48)}`);
  expect(res?.status()).toBe(404);
  expect(page.url()).not.toContain("/login");
  const bad = await page.goto("/quote/not-a-token");
  expect(bad?.status()).toBe(404);
});

test("the package checkout asks customers to sign in first", async ({ page }) => {
  await page.goto("/checkout/package?package=demo-braj-84-kos-yatra&adults=2");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(page.url())).toContain("/checkout/package");
});
