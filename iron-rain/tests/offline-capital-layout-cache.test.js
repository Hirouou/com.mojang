import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('offline shell keeps the canonical capital layout available for local world materialization', () => {
  assert.match(serviceWorker, /'\.\/modules\/capital-city-layout\.js'/);
  assert.match(serviceWorker, /CACHE_NAME = `\$\{CACHE_PREFIX\}v7\.30`/);
});
