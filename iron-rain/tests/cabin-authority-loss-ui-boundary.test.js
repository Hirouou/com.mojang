import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('authority loss ejects both the cabin renderer and parent station state', () => {
  const match = source.match(/function reconcileCrewStation\(\) \{([\s\S]*?)\n  \}\n\n  view =/);
  assert.ok(match, 'reconcileCrewStation boundary must remain explicit');
  const body = match[1];
  const cleanup = source.match(/function runPointerUnlockCleanup\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(cleanup, 'parent operator cleanup boundary must remain explicit');

  assert.match(body, /activeCrewStation = null;/);
  assert.match(body, /core\.leaveStation\?\.\(\);/);
  assert.match(body, /runPointerUnlockCleanup\(\);/);
  assert.match(cleanup[1], /originalOnPointerUnlock\?\.\(\)/);
  assert.ok(
    body.indexOf('activeCrewStation = null') < body.indexOf('runPointerUnlockCleanup'),
    'local ownership must be cleared before parent gameplay cleanup runs',
  );
});