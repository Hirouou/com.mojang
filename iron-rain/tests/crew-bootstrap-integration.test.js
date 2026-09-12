import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');

test('bootstrap attaches crew runtime to the asynchronously-created cabin', async () => {
  const [bootstrap, cabinView] = await Promise.all([
    source('bootstrap.js'),
    source('modules/cabin-view.js'),
  ]);

  assert.match(bootstrap, /createCrewCabinBridge/);
  assert.match(bootstrap, /ironrain:cabin-ready/);
  assert.match(bootstrap, /crewBridge\.update\(dt, nowMs \/ 1000\)/);
  assert.match(cabinView, /new CustomEvent\('ironrain:cabin-ready'/);
  assert.match(cabinView, /detail: \{ cabin: view \}/);
});

test('public multiplayer remains gated until a cross-device transport replaces QA BroadcastChannel', async () => {
  const bootstrap = await source('bootstrap.js');
  assert.match(bootstrap, /const crewQa = params\.has\('crewqa'\)/);
  assert.match(bootstrap, /const transportFactory = crewQa \?/);
  assert.match(bootstrap, /MULTIPLAYER ONLINE · EM PREPARAÇÃO/);
  assert.doesNotMatch(bootstrap, /createCrewBroadcastTransport\(options\)\s*:\s*options/);
});
