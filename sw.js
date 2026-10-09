/* Service worker: apka działa bez internetu (np. w sklepie bez zasięgu). */
const SHELL_CACHE = 'zakupy-shell-v1';
const RUNTIME_CACHE = 'zakupy-runtime-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];
const RUNTIME_HOSTS = /(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$|(^|\.)jsdelivr\.net$|(^|\.)images\.openfoodfacts\.org$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pliki apki: od razu z pamięci, w tle pobierz nowszą wersję.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => null);
        if (cached) { event.waitUntil(network); return cached; }
        const res = await network;
        if (res) return res;
        if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
        return Response.error();
      }),
    );
    return;
  }

  // Czcionki, skaner (wasm) i zdjęcia produktów: zapamiętaj po pierwszym pobraniu.
  if (RUNTIME_HOSTS.test(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // Open Food Facts API: zawsze z sieci (domyślnie).
});
