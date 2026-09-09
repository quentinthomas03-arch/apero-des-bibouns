const CACHE_VERSION = "bibouns-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./app.js",
  "./questions.js",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for JS/CSS (pick up updates fast), cache-first for everything else.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isAsset = url.endsWith(".js") || url.endsWith(".css");

  if (isAsset) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
