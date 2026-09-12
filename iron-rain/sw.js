/* Offline shell. Paths stay relative so the installed app and GitHub Pages share one stable URL. */
const CACHE_PREFIX = `iron-rain:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v7.14`;
const OFFLINE_FILES = [
  './index.html',
  './style-v6.css',
  './style-v7.css',
  './mobile-station-ui.css',
  './bootstrap.js',
  './game-v6.js',
  './modules/ballistics.js',
  './modules/pointer-controls.js',
  './modules/war-simulation.js',
  './modules/table-map.js',
  './modules/map-touch-precision.js',
  './modules/camera-director.js',
  './modules/battlefield-view.js',
  './modules/cabin-controls.js',
  './modules/cabin-view.js',
  './modules/cabin-hit-feedback.js',
  './modules/factions.js',
  './modules/crew-presence.js',
  './modules/crew-avatar-visual.js',
  './modules/crew-visual-layer.js',
  './modules/crew-replication.js',
  './modules/crew-session.js',
  './modules/crew-runtime.js',
  './modules/crew-cabin-bridge.js',
  './modules/crew-broadcast-transport.js',
  './modules/crew-mqtt-transport.js',
  './modules/crew-station-authority.js',
  './modules/crew-station-gate.js',
  './modules/crew-lobby-ui.js',
  './modules/mamute-command-authority.js',
  './modules/theatre-control.js',
  './modules/theatre-sectors.js',
  './modules/strategic-hex-map.js',
  './modules/strategic-war-live.js',
  './modules/strategic-war-live-v3.js',
  './modules/world-map-intel.js',
  './modules/local-missions.js',
  './modules/territory-development.js',
  './modules/territory-ai.js',
  './modules/strategic-logistics.js',
  './modules/mamute-logistics.js',
  './modules/persistent-war-clock.js',
  './modules/loading-cycle.js',
  './modules/loader-arm.js',
  './modules/war-audio.js',
  './modules/key-bindings.js',
  './modules/engine-system.js',
  './modules/maintenance-feedback.js',
  './modules/maintenance-overlay.js',
  './vendor/three.module.min.js',
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
      // Network first is intentional: the home-screen app keeps the SAME URL,
      // but reopening it online pulls the newest deployed build before falling
      // back to the offline copy.
      const response = await fetch(request, { cache: 'no-store' });
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
