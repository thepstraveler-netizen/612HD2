import { expect, test } from "@playwright/test";

// CI has no Supabase, so the cab catalog is empty and booking is closed:
// these cover the page shells, URL state, access control and the driver
// link's public/expired handling. Planning and pricing are unit-tested in
// tests/unit/cab-search.test.ts and the UI helpers in tests/unit/cab-ui.test.ts.

test("cab search renders the tabs and switches between them", async ({ page }) => {
  await page.goto("/cabs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a cab for every Braj journey" }),
  ).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Trip type" });
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  await expect(tabs.getByRole("tab", { name: "Outstation" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("radio", { name: "Round trip" })).toBeAttached();

  await tabs.getByRole("tab", { name: "Local" }).click();
  await expect(tabs.getByRole("tab", { name: "Local" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Package", { exact: true })).toBeVisible();

  await tabs.getByRole("tab", { name: "Airport & station" }).click();
  await expect(page.getByText(/between a railway station or airport and your hotel/)).toBeVisible();

  await tabs.getByRole("tab", { name: "Sightseeing" }).click();
  await expect(page.getByText("Sightseeing tours are coming soon.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Why travel with us" })).toBeVisible();
});

test("searching without a destination explains what's missing", async ({ page }) => {
  await page.goto("/cabs");
  await page.getByRole("button", { name: "Search cabs" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please choose where to start." })).toBeVisible();
  await expect(page).toHaveURL(/\/cabs$/);
});

test("cab search is available in Hindi", async ({ page }) => {
  await page.goto("/hi/cabs");
  await expect(
    page.getByRole("heading", { level: 1, name: "ब्रज की हर यात्रा के लिए कैब बुक करें" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "लोकल" })).toBeVisible();
});

test("results with an incomplete search show a friendly message", async ({ page }) => {
  const res = await page.goto("/cabs/search?type=one_way&from=vrindavan&pax=abc");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Tell us about your trip")).toBeVisible();
  await expect(page.getByRole("search", { name: "Search cabs" })).toBeVisible();
});

test("the review page asks travellers to sign in first", async ({ page }) => {
  await page.goto(
    "/cabs/review?type=one_way&from=vrindavan&to=agra&at=2026-12-01T09:00&pax=2&category=sedan",
  );
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(page.url())).toContain("/cabs/review?type=one_way&from=vrindavan");
});

test("an unknown driver link shows the expired page with a 404", async ({ page }) => {
  const res = await page.goto(`/driver/trip/${"0".repeat(48)}`);
  expect(res?.status()).toBe(404);
  await expect(page).toHaveURL(/\/driver\/trip\//);
  await expect(page.getByRole("heading", { name: "This trip link has expired" })).toBeVisible();

  const hi = await page.goto("/hi/driver/trip/not-a-token");
  expect(hi?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "इस यात्रा का लिंक खत्म हो गया है" })).toBeVisible();
});

test("the driver portal still needs a login", async ({ page }) => {
  await page.goto("/driver");
  await expect(page).toHaveURL(/\/login\?next=%2Fdriver/);
});
