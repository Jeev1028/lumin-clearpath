// Hand-written, dependency-free service worker (no build-tool integration --
// this is a static file served as-is, so there's no risk of it landing in
// the wrong output directory the way a plugin-generated one did).
//
// Strategy, kept intentionally simple:
//  - Navigations (page loads): network-first, falling back to the cache,
//    falling back to /offline.html if nothing is cached either.
//  - Same-origin static assets (JS/CSS/images/fonts): cache-first, filling
//    the cache in the background as pages are visited.
//  - Everything under /api/: never intercepted -- always goes straight to
//    the network so data is never served stale.

const CACHE_NAME = "clearpath-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/favicon.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never intercept API calls

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
    return;
  }

  const destination = request.destination;
  if (["script", "style", "image", "font"].includes(destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
