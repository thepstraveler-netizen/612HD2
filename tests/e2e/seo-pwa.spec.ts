import { expect, test } from "@playwright/test";

/**
 * SEO + PWA surface. Runs without Supabase like the other specs: the
 * sitemap then lists the static pages and the built-in services.
 */

test("robots.txt blocks private areas and links the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-Agent: \*/i);
  expect(body).toContain("Disallow: /admin");
  expect(body).toContain("Disallow: /hi/admin");
  expect(body).toContain("Disallow: /checkout");
  expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("sitemap.xml is XML with hreflang alternates", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  expect(xml).toContain("<urlset");
  expect(xml).toMatch(/<loc>[^<]*\/hotels<\/loc>/);
  expect(xml).toMatch(/<loc>[^<]*\/hi\/hotels<\/loc>/);
  expect(xml).toMatch(/hreflang="hi"/);
  expect(xml).toMatch(/hreflang="x-default"/);
});

test("manifest parses and every icon is a PNG", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe("The P & S Traveler Group");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png" }]) {
    const img = await request.get(icon.src);
    expect(img.status(), icon.src).toBe(200);
    expect(img.headers()["content-type"], icon.src).toContain("image/png");
    const bytes = await img.body();
    // PNG signature.
    expect(bytes.subarray(0, 4).toString("hex"), icon.src).toBe("89504e47");
  }
});

test("service worker script is served uncached", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-cache");
  expect(await res.text()).toContain("ps-trips-v1");
});

test("default OG image renders", async ({ request }) => {
  const res = await request.get("/og/default.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("offline page renders in English and Hindi", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You are offline");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/hi/offline");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("आप ऑफ़लाइन हैं");
});

test("home has canonical, hreflang links and valid JSON-LD", async ({ page }) => {
  await page.goto("/");
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/^https?:\/\/[^/]+\/?$/);
  for (const lang of ["en", "hi", "x-default"]) {
    await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveCount(1);
  }
  await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute("href", /\/hi$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(scripts.length).toBeGreaterThan(0);
  const docs = scripts.map((s) => JSON.parse(s) as { "@graph"?: { "@type": string }[] });
  const types = docs.flatMap((d) => d["@graph"]?.map((n) => n["@type"]) ?? []);
  expect(types).toEqual(expect.arrayContaining(["Organization", "TravelAgency", "WebSite"]));
});

test("Hindi home canonical points at /hi", async ({ page }) => {
  await page.goto("/hi");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/hi$/);
});

test("listing pages carry their own canonical", async ({ page }) => {
  await page.goto("/hi/cabs");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/hi\/cabs$/);
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const nodes = scripts.flatMap((s) =>
    [JSON.parse(s) as { "@type"?: string } | { "@type"?: string }[]].flat(),
  );
  expect(nodes.map((n) => n["@type"])).toEqual(expect.arrayContaining(["TaxiService", "BreadcrumbList"]));
});

// Chromium's offline emulation reliably covers the first service-worker
// fetch after going offline, so each locale gets its own fresh context.
for (const [home, target, heading] of [
  ["/", "/cabs", "You are offline"],
  ["/hi", "/hi/hotels", "आप ऑफ़लाइन हैं"],
] as const) {
  test(`service worker serves the offline page for ${target} when the network is down`, async ({
    page,
    context,
  }) => {
    await page.goto(home);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first load is not controlled yet; reload so the worker handles navigations.
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // Offline emulation does not always reach the worker's own fetches, so also fail
    // the page request at the network layer (routing covers service-worker requests).
    await context.route(`**${target}`, (route) => route.abort("internetdisconnected"));
    await context.setOffline(true);
    const res = await page.goto(target);
    expect(res?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await context.setOffline(false);
  });
}
