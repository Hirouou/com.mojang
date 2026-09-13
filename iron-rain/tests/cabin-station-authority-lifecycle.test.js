import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('cabin never treats a missing crew bridge as single-player station authority', () => {
  assert.match(source, /if \(!bridge\?\.requestStation\) \{[\s\S]*reason: 'authority-unavailable'/);
  assert.doesNotMatch(source, /if \(!bridge\?\.requestStation\) return \{ ok: true, ready: true, reason: 'single-player'/);
  assert.match(source, /mode === ['"]offline['"] && options\.allowOfflineCabinQa === true/);
});

test('active station is revalidated and exited when canonical ownership is lost', () => {
  assert.match(source, /function reconcileCrewStation\(\)/);
  assert.match(source, /bridge\?\.stationState/);
  assert.match(source, /if \(state\?\.ready\) return true;/);
  assert.match(source, /activeCrewStation = null;[\s\S]*core\.leaveStation\?\.\(\);/);
  assert.match(source, /update\(dt, data = \{\}\) \{\s*reconcileCrewStation\(\);/);
});
