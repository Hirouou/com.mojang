/* Offline shell. Paths stay relative so the installed app and GitHub Pages share one stable URL. */
const CACHE_PREFIX = `iron-rain:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v7.26`;
const MODULE_TIMEOUT_MS = 4500;
const OFFLINE_FILES = [
  './index.html','./style-v6.css','./style-v7.css','./mobile-station-ui.css','./bootstrap.js','./game-v6.js',
  './modules/ballistics.js','./modules/pointer-controls.js','./modules/war-simulation.js','./modules/war-simulation-core.js','./modules/table-map.js','./modules/map-touch-precision.js','./modules/camera-director.js','./modules/march-autopilot.js','./modules/operator-enhancements.js','./modules/tank-tactics.js','./modules/battlefield-view.js','./modules/cabin-controls.js','./modules/cabin-view.js','./modules/cabin-view-core.js','./modules/cabin-hit-feedback.js','./modules/remote-hull-impact-feedback.js','./modules/factions.js','./modules/crew-presence.js','./modules/crew-avatar-visual.js','./modules/crew-visual-layer.js','./modules/crew-replication.js','./modules/crew-local-pose.js','./modules/crew-session.js','./modules/crew-runtime.js','./modules/crew-cabin-bridge.js','./modules/crew-broadcast-transport.js','./modules/crew-mqtt-transport.js','./modules/crew-station-authority.js','./modules/crew-station-gate.js','./modules/crew-lobby-ui.js','./modules/mamute-command-authority.js','./modules/integration-live.js','./modules/spawn-selector.js','./modules/maintenance-effect-cadence.js','./modules/remote-maintenance-feedback.js','./modules/mobile-ux-review.js','./modules/theatre-control.js','./modules/theatre-sectors.js','./modules/theatre-regions.js','./modules/theatre-mamutes.js','./modules/theatre-mamute-map.js','./modules/theatre-mamute-materialization.js','./modules/theatre-mamute-snapshot.js','./modules/theatre-mamute-lifecycle.js','./modules/strategic-hex-map.js','./modules/strategic-front-pressure.js','./modules/strategic-capture-state.js','./modules/strategic-war-live.js','./modules/strategic-war-live-v2.js','./modules/strategic-war-live-v3.js','./modules/world-map-intel.js','./modules/intel-knowledge.js','./modules/intel-map-snapshot.js','./modules/intel-report-ledger.js','./modules/local-missions.js','./modules/territory-development.js','./modules/territory-ai.js','./modules/territory-region-control.js','./modules/strategic-logistics.js','./modules/mamute-logistics.js','./modules/persistent-war-clock.js','./modules/combat-recovery.js','./modules/combat-reserves.js','./modules/combat-sustainment.js','./modules/artillery-charge-table-view.js','./modules/artillery-crank-guide.js','./modules/artillery-notebook.js','./modules/artillery-shot-replay-guard.js','./modules/loading-cycle.js','./modules/loader-arm.js','./modules/loader-audio-cue.js','./modules/war-audio.js','./modules/key-bindings.js','./modules/engine-system.js','./modules/maintenance-feedback.js','./modules/maintenance-overlay.js','./vendor/three.module.min.js','./manifest-v6.webmanifest','./icons/m47.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',
];
const assetURLs = OFFLINE_FILES.map(path => new URL(path, self.registration.scope).href);
const knownAssets = new Set(assetURLs);
const indexURL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
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

async function networkFirstModule(request, cache) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), MODULE_TIMEOUT_MS) : 0;
  try {
    const response = await fetch(request, { cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
    if (response.ok) {
      try { await cache.put(request, response.clone()); } catch {}
      return response;
    }
  } catch {}
  finally { if (timer) clearTimeout(timer); }

  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request, { cache: 'reload' });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.search || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const navigation = request.mode === 'navigate';
  if (navigation && url.href !== scope.href && url.href !== indexURL) return;
  if (!navigation && !knownAssets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (!navigation) {
      const moduleRequest = request.destination === 'script' || url.pathname.endsWith('.js');
      if (moduleRequest) return networkFirstModule(request, cache);

      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch {}
      }
      return response;
    }

    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok && (response.type === 'basic' || response.type === 'default')) {
        try { await cache.put(indexURL, response.clone()); } catch {}
      }
      if (response.ok) return response;
      return await cache.match(indexURL) || response;
    } catch (error) {
      const cached = await cache.match(indexURL);
      if (cached) return cached;
      throw error;
    }
  })());
});