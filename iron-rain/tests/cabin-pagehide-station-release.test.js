import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('cabin releases crew claims when the mobile page is hidden', () => {
  assert.match(source, /function releaseCrewStationsForBackground\(\)\s*\{[\s\S]*cancelPendingCrewStation\(\);[\s\S]*if \(activeCrewStation && leaveCrewStation\(\) !== false\) runPointerUnlockCleanup\(\);[\s\S]*\}/);
  assert.match(source, /function onPageHide\(\) \{ releaseCrewStationsForBackground\(\); \}/);
  assert.match(source, /globalThis\.addEventListener\?\.\('pagehide', onPageHide\);/);
});

test('background station release reuses the parent operator cleanup seam', () => {
  assert.match(source, /function runPointerUnlockCleanup\(\)\s*\{[\s\S]*originalOnPointerUnlock\?\.\(\);[\s\S]*\}/);
  assert.match(source, /if \(activeCrewStation && leaveCrewStation\(\) !== false\) runPointerUnlockCleanup\(\);/);
  assert.match(source, /core\.leaveStation\?\.\(\);[\s\S]*runPointerUnlockCleanup\(\);[\s\S]*return false;/);
});

test('pagehide lifecycle listener is removed with the cabin view', () => {
  assert.match(source, /globalThis\.removeEventListener\?\.\('pagehide', onPageHide\);/);
  assert.match(source, /function onVisibilityChange\(\) \{[\s\S]*visibilityState !== 'hidden'[\s\S]*releaseCrewStationsForBackground\(\);[\s\S]*\}/);
});