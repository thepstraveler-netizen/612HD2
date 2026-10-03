/* The P & S Traveler Group service worker (hand-written, no build step).
 *
 * - Precaches the offline pages (en + hi) and the app icons.
 * - Navigations: network first; when offline, a saved trip page if we have
 *   one, else the localized offline page.
 * - /_next/static and same-origin images: stale-while-revalidate.
 * - Trip pages (/account/trips/<code>, /hi/account/trips/<code>) opened
 *   online are kept in a dedicated cache (max 20) so they open offline. The
 *   site deletes that cache on sign-out (see lib/pwa/client.ts).
 * - Never touches /api, /admin, /auth, /checkout, non-GET requests, RSC
 *   payloads or responses that set cookies.
 *
 * Bump VERSION to drop the old static caches on the next activation. Keep
 * TRIPS_CACHE in sync with lib/pwa/brand.ts.
 */
const VERSION = "v1";
const PRECACHE = `ps-precache-${VERSION}`;
const STATIC_CACHE = `ps-static-${VERSION}`;
const IMAGE_CACHE = `ps-images-${VERSION}`;
const TRIPS_CACHE = "ps-trips-v1";
const KEEP = [PRECACHE, STATIC_CACHE, IMAGE_CACHE, TRIPS_CACHE];

const OFFLINE_EN = "/offline";
const OFFLINE_HI = "/hi/offline";
const PRECACHE_URLS = [
  OFFLINE_EN,
  OFFLINE_HI,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/manifest.webmanifest",
];

const MAX_TRIPS = 20;
const MAX_IMAGES = 80;
const MAX_STATIC = 200;

const NEVER = /^\/(?:hi\/)?(?:api|admin|auth|checkout)(?:\/|$)/;
const TRIP_PAGE = /^\/(?:hi\/)?account\/trips\/[^/]+\/?$/;
const LOGIN_PAGE = /^\/(?:hi\/)?login\/?$/;

/** Script and style URLs an HTML page needs, so it can hydrate offline. */
function assetUrls(html) {
  return [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
}

async function precache() {
  const cache = await caches.open(PRECACHE);
  // One failing URL must not abort the install.
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "omit", cache: "reload" });
        if (!res.ok) return;
        if ((res.headers.get("content-type") || "").includes("text/html")) {
          const assets = assetUrls(await res.clone().text());
          await Promise.all(
            assets.map((asset) =>
              fetch(asset)
                .then((r) => (r.ok ? cache.put(asset, r) : undefined))
                .catch(() => undefined),
            ),
          );
        }
        await cache.put(url, res);
      } catch {
        // Offline during install: the next visit retries.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("ps-") && !KEEP.includes(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "ps:clear-trips") event.waitUntil(caches.delete(TRIPS_CACHE));
});

function cacheable(res) {
  // Set-Cookie is hidden from service workers, but check anyway in case a
  // platform ever exposes it.
  return res && res.ok && res.type === "basic" && !res.headers.has("set-cookie");
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  // Cache keys come back in insertion order: drop the oldest.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

function offlinePage(pathname) {
  const url = pathname === "/hi" || pathname.startsWith("/hi/") ? OFFLINE_HI : OFFLINE_EN;
  return caches.match(url, { cacheName: PRECACHE }).then((res) => res || caches.match(OFFLINE_EN));
}

async function handleNavigation(event, url) {
  const isTrip = TRIP_PAGE.test(url.pathname);
  const tripKey = url.origin + url.pathname.replace(/\/$/, "");
  try {
    const res = await fetch(event.request);
    if (isTrip) {
      const cache = await caches.open(TRIPS_CACHE);
      const final = new URL(res.url || url.href);
      if (res.redirected && LOGIN_PAGE.test(final.pathname)) {
        // Signed out: forget the saved copy.
        await cache.delete(tripKey);
      } else if (cacheable(res) && !res.redirected) {
        await cache.delete(tripKey);
        await cache.put(tripKey, res.clone());
        event.waitUntil(trim(TRIPS_CACHE, MAX_TRIPS));
      }
    }
    return res;
  } catch {
    if (isTrip) {
      const saved = await caches.match(tripKey, { cacheName: TRIPS_CACHE });
      if (saved) return saved;
    }
    return (await offlinePage(url.pathname)) || Response.error();
  }
}

async function staleWhileRevalidate(event, cacheName, max) {
  const cache = await caches.open(cacheName);
  // Precached assets (the offline pages' scripts) live outside the trimmed caches.
  const cached =
    (await cache.match(event.request)) || (await caches.match(event.request, { cacheName: PRECACHE }));
  const network = fetch(event.request)
    .then(async (res) => {
      if (cacheable(res)) {
        await cache.put(event.request, res.clone());
        await trim(cacheName, max);
      }
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.test(url.pathname)) return;
  // React Server Component payloads and prefetches stay with the network.
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE, MAX_STATIC));
    return;
  }
  if (
    request.destination === "image" ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE, MAX_IMAGES));
  }
});
