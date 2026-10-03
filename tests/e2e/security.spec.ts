import { expect, test, type Page } from "@playwright/test";

/** Collects CSP violations from the console and the securitypolicyviolation event. */
async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply)/i.test(text))
      violations.push(text);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(
        `Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`,
      );
    });
  });
  return violations;
}

test("every page carries a Content-Security-Policy", async ({ request }) => {
  for (const path of ["/", "/hi", "/login"]) {
    const res = await request.get(path);
    const csp = res.headers()["content-security-policy"];
    expect(csp, path).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://checkout.razorpay.com");
    expect(csp).not.toContain("'unsafe-eval'");
  }
});

for (const path of ["/", "/hi", "/hotels", "/packages", "/travel", "/services/car", "/signup", "/login"]) {
  test(`${path} loads without CSP violations`, async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main").first()).toBeVisible();
    expect(violations).toEqual([]);
  });
}

test("Turnstile stays off without a site key", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByTestId("turnstile")).toHaveCount(0);
});

test("maintenance preview sends signed-out visitors to login first", async ({ page }) => {
  await page.goto("/api/security/maintenance-preview?next=%2Fhotels");
  await expect(page).toHaveURL(/\/login\?next=%2Fapi%2Fsecurity%2Fmaintenance-preview/);
});

test("the site is open while maintenance mode is off", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("maintenance-page")).toHaveCount(0);
  await expect(page.locator("header")).toBeVisible();
});
