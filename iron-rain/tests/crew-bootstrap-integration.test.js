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

test('production multiplayer uses a cross-device transport while BroadcastChannel stays QA-only', async () => {
  const bootstrap = await source('bootstrap.js');
  assert.match(bootstrap, /const crewQa = params\.has\('crewqa'\)/);
  assert.match(bootstrap, /createCrewMqttTransport/);
  assert.match(bootstrap, /\? options => createCrewBroadcastTransport\(options\)/);
  assert.match(bootstrap, /: options => createCrewMqttTransport\(options\)/);
  assert.match(bootstrap, /beginCrew\('host', room, faction\)/);
  assert.match(bootstrap, /beginCrew\('guest', room, faction\)/);
  assert.doesNotMatch(bootstrap, /MULTIPLAYER ONLINE · EM PREPARAÇÃO/);
});

test('each browser tab gets its own crew identity so local QA peers do not self-filter', async () => {
  const bootstrap = await source('bootstrap.js');
  assert.match(bootstrap, /sessionStorage\.getItem\(tabKey\)/);
  assert.match(bootstrap, /sessionStorage\.setItem\(tabKey, created\)/);
  assert.match(bootstrap, /iron-rain-device-id/);
});
