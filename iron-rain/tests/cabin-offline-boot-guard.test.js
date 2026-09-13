import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('offline cabin bypass is restricted to explicit renderer QA', () => {
  const offlineGuard = source.indexOf("globalThis.ironRainEntry?.mode === 'offline'");
  const qaGate = source.indexOf('options.allowOfflineCabinQa === true', offlineGuard);
  const coreBoot = source.indexOf('createCabinViewCore(canvas, options)', offlineGuard);
  const scenePatch = source.indexOf('THREE.Scene.prototype.add = function captureCabinScene');

  assert.ok(offlineGuard >= 0, 'offline diagnostic guard must exist');
  assert.ok(qaGate > offlineGuard, 'offline bypass must require the explicit QA flag');
  assert.ok(coreBoot > qaGate, 'QA bypass must boot the proven core renderer directly');
  assert.ok(scenePatch > coreBoot, 'QA path must return before multiplayer scene interception');
  assert.match(source.slice(offlineGuard, scenePatch), /return core;/, 'QA boot must return the core cabin');
});

test('normal solo, host and guest sessions keep the crew-aware canonical renderer path', () => {
  assert.match(source, /createCabinViewCore\(canvas, gatedOptions\)/, 'product cabin must boot through crew-aware gated options');
  assert.match(source, /createCabinCrewVisualLayer\(scene, \{ capacity: 2 \}\)/, 'crew visuals must remain attached to the cabin scene');
});
