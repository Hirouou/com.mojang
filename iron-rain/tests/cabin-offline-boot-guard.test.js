import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('offline cabin bypasses multiplayer scene wrapping during boot', () => {
  const offlineGuard = source.indexOf("globalThis.ironRainEntry?.mode === 'offline'");
  const coreBoot = source.indexOf('createCabinViewCore(canvas, options)', offlineGuard);
  const scenePatch = source.indexOf('THREE.Scene.prototype.add = function captureCabinScene');

  assert.ok(offlineGuard >= 0, 'offline guard must exist');
  assert.ok(coreBoot > offlineGuard, 'offline guard must boot the proven core renderer directly');
  assert.ok(scenePatch > coreBoot, 'offline path must return before multiplayer scene interception');
  assert.match(source.slice(offlineGuard, scenePatch), /return core;/, 'offline boot must return the core cabin');
});
