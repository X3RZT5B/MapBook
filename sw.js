// Millbrook Mapbook — service worker.
// Caches the app shell + data + every map page on first install so the app
// works fully offline once it has been opened on the network.
// Bump CACHE_VERSION whenever streets.json or page_labels.json changes.

const CACHE_VERSION = 'mapbook-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './streets.json',
  './maps/page_labels.json',
];
const MAP_RANGE = { start: 0, end: 153 };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    self.clients.claim();

    // Background prefetch of map pages — slow trickle so we don't hammer the network.
    const cache = await caches.open(CACHE_VERSION);
    for (let i = MAP_RANGE.start; i <= MAP_RANGE.end; i++) {
      const padded = String(i).padStart(3, '0');
      const url = `maps/pdf_${padded}.jpg`;
      try {
        const has = await cache.match(url);
        if (!has) {
          const resp = await fetch(url, { cache: 'reload' });
          if (resp.ok) await cache.put(url, resp.clone());
        }
      } catch (_e) { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (_e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw _e;
    }
  })());
});
