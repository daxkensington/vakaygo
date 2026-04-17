// VakayGo Service Worker
//
// Cache strategy:
//   - /api/* and HTML pages: network-first, fall back to cached HTML / offline
//   - /_next/static/* and asset extensions: cache-first
//   - Listing detail pages (/{island}/{slug}): network-first into DYNAMIC_CACHE,
//     fall back to FAVORITES_CACHE (operator-saved offline reads)
//
// Update flow:
//   - skipWaiting is NOT called on install; the new SW stays in `waiting`
//     until the page posts {type:"SKIP_WAITING"}. lib/register-sw.ts dispatches
//     a `sw-update-available` window event when a new SW reaches `installed`,
//     letting the UI prompt the user before applying.
//   - Bump CACHE_VERSION on every release that changes cached behavior; the
//     activate handler purges any cache whose key doesn't match the current
//     version prefix.
const CACHE_VERSION = "vakaygo-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const FAVORITES_CACHE = `${CACHE_VERSION}-favorites`;
const ALL_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, FAVORITES_CACHE];

const STATIC_ASSETS = ["/offline", "/manifest.json"];

// Paths that should never be cached or served from cache (auth-sensitive,
// admin/operator dashboards, API write endpoints).
const NEVER_CACHE_PREFIXES = [
  "/admin",
  "/operator",
  "/auth",
  "/api/auth",
  "/api/admin",
  "/api/operator",
  "/profile",
  "/messages",
  "/bookings",
];

function isNeverCachePath(pathname) {
  return NEVER_CACHE_PREFIXES.some((p) => pathname.startsWith(p));
}

// Listing detail = /{island-slug}/{listing-slug}, two non-empty segments,
// no leading admin/auth/etc.
const LISTING_DETAIL_RE = /^\/[a-z0-9-]+\/[a-z0-9-]+$/;
function isListingDetail(pathname) {
  return LISTING_DETAIL_RE.test(pathname) && !isNeverCachePath(pathname);
}

// Install: pre-cache static assets + offline page. Does NOT skipWaiting —
// the user-facing update prompt drives that via SKIP_WAITING message.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: purge caches that don't belong to the current version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !ALL_CACHES.includes(key)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;
  // Cross-origin: never intercept (the fetch goes straight to network).
  if (url.origin !== self.location.origin) return;
  if (isNeverCachePath(url.pathname)) return;

  // Listing detail pages and the listing API: cache for offline favorites
  if (
    url.pathname.match(/^\/api\/listings\/[^/]+$/) ||
    isListingDetail(url.pathname)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.open(FAVORITES_CACHE).then((cache) => cache.match(request)) ||
              caches.match("/offline")
          )
        )
    );
    return;
  }

  // Other API + HTML pages: network-first, only fall back to cache offline.
  // We do NOT cache HTML responses opportunistically — too easy to serve a
  // stale signed-in shell to a signed-out user (or vice versa).
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/offline"))
      )
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(
      /\.(css|js|woff2?|ttf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/
    ) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener("message", (event) => {
  // Apply a queued update — triggered by lib/register-sw.ts after the user
  // accepts the in-app "new version available" prompt.
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === "CACHE_LISTING") {
    const { slug, data } = event.data;
    if (!slug || !data) return;

    const listingApiUrl = new URL(`/api/listings/${slug}`, self.location.origin)
      .href;
    const listingPageUrl = new URL(
      `/${data.islandSlug}/${slug}`,
      self.location.origin
    ).href;

    caches.open(FAVORITES_CACHE).then((cache) => {
      const apiResponse = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put(listingApiUrl, apiResponse);

      caches.open(DYNAMIC_CACHE).then((dynCache) => {
        dynCache.match(listingPageUrl).then((cached) => {
          if (cached) cache.put(listingPageUrl, cached.clone());
        });
      });
    });
    return;
  }

  if (event.data && event.data.type === "UNCACHE_LISTING") {
    const { slug, islandSlug } = event.data;
    if (!slug) return;

    caches.open(FAVORITES_CACHE).then((cache) => {
      cache.delete(new URL(`/api/listings/${slug}`, self.location.origin).href);
      if (islandSlug) {
        cache.delete(
          new URL(`/${islandSlug}/${slug}`, self.location.origin).href
        );
      }
    });
  }
});

self.addEventListener("push", (event) => {
  let data = {
    title: "VakayGo",
    body: "You have a new notification",
    url: "/explore",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
      vibrate: [100, 50, 100],
      tag: "vakaygo-notification",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/explore";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
