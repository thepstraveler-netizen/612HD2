import { expect, test } from "@playwright/test";

// CI has no Supabase: nobody is signed in, `partners.defaults` falls back
// to its schema defaults and the CMS "why collaborate" section may be
// missing (the page then uses its built-in points). These cover the
// signed-out Partner With Us page: the pitch and the sign-in / sign-up
// buttons that come back to /partner. The form's helpers and schemas are
// unit-tested in tests/unit/partners-ui.test.ts.

test("signed out, /partner shows the pitch and a sign-in link back to it", async ({ page }) => {
  await page.goto("/partner");
  await expect(page.getByRole("heading", { level: 1, name: "Partner With Us" })).toBeVisible();

  // The pitch: why collaborate, who we work with, how joining works.
  await expect(page.getByRole("heading", { level: 2, name: /collaborat/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "We work with" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How joining works" })).toBeVisible();

  // Sign in / sign up, both returning to /partner.
  await expect(page.getByRole("heading", { level: 2, name: "Sign in to apply" })).toBeVisible();
  const signIn = page.getByRole("link", { name: "Sign in to apply" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/login?next=%2Fpartner");
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
    "href",
    "/signup?next=%2Fpartner",
  );

  // No application form or status for a visitor.
  await expect(page.getByRole("form", { name: /application/i })).toHaveCount(0);
  await expect(page.getByTestId("partner-status")).toHaveCount(0);
});

test("the Hindi page is translated and keeps the locale on sign-in", async ({ page }) => {
  await page.goto("/hi/partner");
  await expect(page.getByRole("heading", { level: 1, name: "हमारे साथ जुड़ें" })).toBeVisible();
  const signIn = page.getByRole("link", { name: "साइन इन करके आवेदन करें" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/hi/login?next=%2Fpartner");
});

test("the sign-in link opens the login page", async ({ page }) => {
  await page.goto("/partner");
  await page.getByRole("link", { name: "Sign in to apply" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpartner$/);
});
