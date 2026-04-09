// VakayGo Service Worker
const CACHE_VERSION = "vakaygo-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const FAVORITES_CACHE = `${CACHE_VERSION}-favorites`;

const STATIC_ASSETS = [
  "/offline",
  "/manifest.json",
];

// Install: pre-cache static assets + offline page
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key !== STATIC_CACHE &&
              key !== DYNAMIC_CACHE &&
              key !== FAVORITES_CACHE
          )
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for pages/API
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip chrome-extension and other non-http(s)
  if (!url.protocol.startsWith("http")) return;

  // Check favorites cache for saved listing pages when offline
  if (url.pathname.match(/^\/api\/listings\/[^/]+$/) || url.pathname.match(/^\/[^/]+\/[^/]+$/)) {
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

  // API calls and HTML pages: network-first
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML responses
          if (
            response.ok &&
            request.headers.get("accept")?.includes("text/html")
          ) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Serve cached version or offline page
          return caches.match(request).then(
            (cached) => cached || caches.match("/offline")
          );
        })
    );
    return;
  }

  // Static assets (CSS, JS, images, fonts): cache-first
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

  // Default: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Message handler: cache listing data for offline favorites
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_LISTING") {
    const { slug, data } = event.data;
    if (!slug || !data) return;

    const listingApiUrl = new URL(`/api/listings/${slug}`, self.location.origin).href;
    const listingPageUrl = new URL(`/${data.islandSlug}/${slug}`, self.location.origin).href;

    caches.open(FAVORITES_CACHE).then((cache) => {
      // Cache the API response as JSON
      const apiResponse = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put(listingApiUrl, apiResponse);

      // Also try to cache the page itself from dynamic cache
      caches.open(DYNAMIC_CACHE).then((dynCache) => {
        dynCache.match(listingPageUrl).then((cached) => {
          if (cached) {
            cache.put(listingPageUrl, cached.clone());
          }
        });
      });
    });
  }

  if (event.data && event.data.type === "UNCACHE_LISTING") {
    const { slug, islandSlug } = event.data;
    if (!slug) return;

    caches.open(FAVORITES_CACHE).then((cache) => {
      cache.delete(new URL(`/api/listings/${slug}`, self.location.origin).href);
      if (islandSlug) {
        cache.delete(new URL(`/${islandSlug}/${slug}`, self.location.origin).href);
      }
    });
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  let data = { title: "VakayGo", body: "You have a new notification", url: "/explore" };

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

// Notification click: navigate to URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/explore";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new tab
      return self.clients.openWindow(url);
    })
  );
});
