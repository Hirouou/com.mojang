import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scope = 'https://example.github.io/iron-rain/';

async function worker({ offline = false } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const deleted = [];
  const fetched = [];
  const installed = [];
  const cacheAPI = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      const key = request => typeof request === 'string' ? request : request.url;
      return {
        async addAll(urls) { installed.push(...urls); for (const url of urls) store.set(url, new Response('installed ' + url)); },
        async put(request, response) { store.set(key(request), response); },
        async match(request) { return store.get(key(request))?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); return stores.delete(name); },
  };
  vm.runInNewContext(await readFile(new URL('sw.js', root), 'utf8'), {
    URL, caches: cacheAPI,
    self: { registration: { scope }, addEventListener: (name, callback) => handlers.set(name, callback), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async request => { fetched.push(request.url); if (offline) throw new Error('offline'); return new Response('fresh build'); },
  });
  async function lifecycle(name) {
    let completion;
    handlers.get(name)({ waitUntil: promise => { completion = promise; } });
    await completion;
  }
  function request(path, { mode = 'navigate', method = 'GET' } = {}) {
    let response;
    handlers.get('fetch')({ request: { url: new URL(path, scope).href, mode, method }, respondWith: promise => { response = promise; } });
    return response;
  }
  return { stores, deleted, fetched, installed, lifecycle, request, cacheAPI };
}

test('PWA is scoped relatively, standalone landscape, with all required icon sizes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest-v6.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.scope, './');
  assert.equal(new URL(manifest.start_url, scope).href, scope + 'index.html');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
    assert.ok(icon);
    const bytes = await readFile(new URL(icon.src, root));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const apple = await readFile(new URL('icons/apple-touch-icon.png', root));
  assert.equal(apple.readUInt32BE(16), 180);
});

test('offline installation includes every runtime module and every listed file exists', async () => {
  const instance = await worker();
  await instance.lifecycle('install');
  assert.ok(instance.installed.length >= 22, 'offline shell may grow as runtime systems are modularized');
  assert.equal(new Set(instance.installed).size, instance.installed.length, 'offline file list must not contain duplicates');
  for (const asset of instance.installed) {
    assert.ok(asset.startsWith(scope));
    assert.equal(new URL(asset).search, '');
    await access(new URL(asset.slice(scope.length), root));
  }
  const main = await readFile(new URL('game-v6.js', root), 'utf8');
  for (const [, relative] of main.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    assert.ok(instance.installed.includes(new URL(relative, scope).href), `Runtime import ${relative} missing from offline installation`);
  }
});

test('activation removes only obsolete IRON RAIN caches within this deployment scope', async () => {
  const instance = await worker();
  for (const name of ['iron-rain:/iron-rain/:v6.0', 'iron-rain:/iron-rain/:v6.1', 'iron-rain:/other-preview/:v6.0', 'another-game-cache']) {
    await instance.cacheAPI.open(name);
  }
  await instance.lifecycle('activate');
  assert.deepEqual(instance.deleted, ['iron-rain:/iron-rain/:v6.0', 'iron-rain:/iron-rain/:v6.1']);
});

test('HTML is network-first and an offline root navigation falls back to installed index', async () => {
  const online = await worker();
  await online.lifecycle('install');
  assert.equal(await (await online.request('./index.html')).text(), 'fresh build');
  assert.deepEqual(online.fetched, [scope + 'index.html']);
  const offline = await worker({ offline: true });
  await offline.lifecycle('install');
  assert.equal(await (await offline.request('./')).text(), 'installed ' + scope + 'index.html');
  assert.equal(await (await offline.request('./modules/ballistics.js', { mode: 'cors' })).text(), 'installed ' + scope + 'modules/ballistics.js');
});

test('diagnostics, other documents, foreign URLs and mutation requests never enter the cache', async () => {
  const instance = await worker();
  for (const path of ['./index.html?test=1', './index.html?test', './other.html', './icons/icon-512.png', 'https://example.github.io/other-game/']) {
    assert.equal(instance.request(path), undefined);
  }
  assert.equal(instance.request('./index.html', { method: 'POST' }), undefined);
  assert.equal(instance.request('./unknown.js', { mode: 'cors' }), undefined);
  assert.equal(instance.fetched.length, 0);
});
