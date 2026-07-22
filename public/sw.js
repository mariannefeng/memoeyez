// Service worker: cache the app shell so the PWA loads offline. The card data itself
// lives in localStorage (see store.js), so API responses are never cached — they go
// network-first and simply fail when offline, which the app handles gracefully.

const CACHE = "memoeyez-shell-v14";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/logo.svg",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/js/app.js",
  "/js/srs.js",
  "/js/store.js",
  "/js/sync.js",
  "/js/api.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API calls — the mirror is the offline source of truth.
  if (url.pathname.startsWith("/api/")) return;

  // App shell: network-first so an online device always gets the latest files;
  // the cache is a fallback only when the network is unavailable (offline). We
  // refresh the cache from every successful same-origin response.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match("/index.html"); // offline fallback
      })
  );
});
