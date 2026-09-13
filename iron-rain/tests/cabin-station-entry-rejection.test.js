import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/cabin-view-core.js', import.meta.url), 'utf8');

test('cabin station entry stays local only when the authority gate accepts it', () => {
  const interact = source.match(/function interact\(\)\{([\s\S]*?)\n  \}\n  function leaveStation/);
  assert.ok(interact, 'interact() implementation should remain discoverable');
  assert.match(interact[1], /if\(onStation\(station\)===false\)\{station=null;stationEase=0;return null;\}/,
    'a rejected station claim must clear the local station and abort interaction');
  assert.match(interact[1], /return station;/,
    'accepted or legacy callbacks should preserve the existing station return path');
});
