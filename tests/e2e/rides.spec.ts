import { expect, test } from "@playwright/test";

// CI has no Supabase, so the ride catalog is empty and `booking.rides` is
// off: these cover the page shell, the form's own validation, the planner's
// error messages, the closed-booking state, access control and the driver
// link's public/expired handling. Planning and pricing are unit-tested in
// tests/unit/rides.test.ts and the UI helpers in tests/unit/ride-ui.test.ts.

test("the rides page renders the form and the closed-booking note", async ({ page }) => {
  await page.goto("/rides");
  await expect(page.getByRole("heading", { level: 1, name: "Quick local rides around Braj" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Online ride booking opens soon" })).toBeVisible();
  const form = page.getByRole("search", { name: "Find a ride" });
  await expect(form.getByRole("radio", { name: "Drop to a place" })).toBeChecked();
  await expect(form.getByRole("combobox", { name: "Pickup" })).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Drop" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Use my location" })).toBeVisible();

  await form.getByText("By the hour").click();
  await expect(form.getByLabel("Hours")).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Drop" })).toHaveCount(0);

  await form.getByText("Schedule").click();
  await expect(form.getByLabel("Pickup date and time")).toBeVisible();
  await expect(page.getByText("Times are India time (IST).")).toBeVisible();
});

test("searching without a pickup explains what's missing", async ({ page }) => {
  await page.goto("/rides");
  await page.getByRole("button", { name: "See fares" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please choose where to be picked up." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/rides$/);
});

test("the planner's errors are shown in plain words", async ({ page }) => {
  await page.goto("/rides?from=nowhere&to=iskcon");
  await expect(page.getByText("We don't know that place")).toBeVisible();

  await page.goto("/rides?mode=point_to_point&from=here&flat=12.9&flng=77.6&to=here&tlat=13&tlng=77.7");
  await expect(page.getByText("That pickup is outside our ride area")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a cab instead" })).toBeVisible();

  await page.goto("/rides?from=here");
  await expect(page.getByText("Tell us about your ride")).toBeVisible();
});

test.describe("with location access blocked", () => {
  test.use({ permissions: [] });

  test("'Use my location' explains how to continue", async ({ page }) => {
    await page.goto("/rides");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/Location access is blocked|couldn't find your location/)).toBeVisible();
  });
});

test.describe("with location access allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: { latitude: 27.5806, longitude: 77.7006 } });

  test("'Use my location' fills the pickup", async ({ page }) => {
    await page.goto("/rides");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("combobox", { name: "Pickup" })).toHaveValue("My location");
    await page.getByRole("button", { name: "See fares" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Please choose where you're going." }),
    ).toBeVisible();
  });
});

test("the rides page is available in Hindi", async ({ page }) => {
  await page.goto("/hi/rides");
  await expect(page.getByRole("heading", { level: 1, name: "ब्रज में झटपट लोकल सवारी" })).toBeVisible();
  await expect(page.getByRole("button", { name: "मेरी लोकेशन इस्तेमाल करें" })).toBeVisible();
  await page.getByRole("button", { name: "किराया देखें" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "कृपया पिकअप की जगह चुनें।" })).toBeVisible();
});

test("the home search card sends ride searches to the rides page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Bike / Rickshaw" }).click();
  await page.getByRole("combobox", { name: "Vehicle" }).selectOption("bike");
  await page.getByRole("button", { name: "See fares" }).click();
  await expect(page).toHaveURL(/\/rides\?v=bike&mode=point_to_point/);
  await expect(page.getByRole("heading", { level: 1, name: "Quick local rides around Braj" })).toBeVisible();
});

test("the ride review page asks riders to sign in first", async ({ page }) => {
  await page.goto("/rides/review?v=bike&mode=point_to_point&from=iskcon&to=banke-bihari&at=now&pax=1");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(page.url())).toContain("/rides/review?v=bike&mode=point_to_point&from=iskcon");
});

test("an unknown driver ride link shows the expired page with a 404", async ({ page }) => {
  const res = await page.goto(`/driver/ride/${"0".repeat(48)}`);
  expect(res?.status()).toBe(404);
  await expect(page).toHaveURL(/\/driver\/ride\//);
  await expect(page.getByRole("heading", { name: "This ride link has expired" })).toBeVisible();

  const hi = await page.goto("/hi/driver/ride/not-a-token");
  expect(hi?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "इस सवारी का लिंक खत्म हो गया है" })).toBeVisible();
});
