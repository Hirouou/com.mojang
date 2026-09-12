/* Offline shell. Paths stay relative so GitHub Pages /iron-rain/ also works. */
const CACHE_PREFIX = `iron-rain:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v6.1`;
const OFFLINE_FILES = [
  './index.html',
  './style-v6.css',
  './game-v6.js',
  './modules/ballistics.js',
  './modules/pointer-controls.js',
  './modules/war-simulation.js',
  './modules/table-map.js',
  './modules/camera-director.js',
  './manifest-v6.webmanifest',
  './icons/m47.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const assetURLs = OFFLINE_FILES.map(path => new URL(path, self.registration.scope).href);
const knownAssets = new Set(assetURLs);
const indexURL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Installation is atomic: a missing module must not create a broken offline build.
    await cache.addAll(assetURLs);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  // Diagnostic URLs stay uncached, including ?test=1 browser acceptance sessions.
  if (request.method !== 'GET' || url.search || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const navigation = request.mode === 'navigate';
  if (navigation && url.href !== scope.href && url.href !== indexURL) return;
  if (!navigation && !knownAssets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Network first allows a refreshed build to appear immediately online.
      const response = await fetch(request);
      if (response.ok && (response.type === 'basic' || response.type === 'default')) {
        try { await cache.put(navigation ? indexURL : request, response.clone()); } catch { /* Storage pressure must not block the online build. */ }
      }
      if (response.ok || !navigation) return response;
      return await cache.match(indexURL) || response;
    } catch (error) {
      const cached = await cache.match(navigation ? indexURL : request);
      if (cached) return cached;
      throw error;
    }
  })());
});
