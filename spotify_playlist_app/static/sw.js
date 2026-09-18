const CACHE_NAME = "playlist-vibes-v2";
const PRECACHE = ["/static/style.css", "/static/app.js", "/static/icons/icon-192.png", "/static/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Always hit the network for the HTML shell and API/auth routes, so updates and
// login state are never stuck behind a stale cache; cache-first for static assets.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isDynamic =
    event.request.mode === "navigate" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/callback");

  if (isDynamic) {
    return; // let these hit the network normally
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
