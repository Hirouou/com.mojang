import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('offline shell keeps the canonical capital layout available for local world materialization', () => {
  assert.match(serviceWorker, /'\.\/modules\/capital-city-layout\.js'/);
  assert.match(serviceWorker, /'\.\/modules\/capital-city-view\.js'/);

  const cacheRevision = serviceWorker.match(/CACHE_NAME = `\$\{CACHE_PREFIX\}v(\d+)\.(\d+)`/);
  assert.ok(cacheRevision, 'service worker must expose a versioned Iron Rain cache');
  const revision = Number(cacheRevision[1]) * 100 + Number(cacheRevision[2]);
  assert.ok(revision >= 730, 'capital materialization renderer must ship on its cache generation or newer');
});