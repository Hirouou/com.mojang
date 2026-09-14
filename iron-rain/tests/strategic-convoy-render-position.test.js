import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/strategic-war-live-v3.js', import.meta.url), 'utf8');

test('strategic renderer consumes canonical convoy lane position and heading', () => {
  assert.match(source, /\|\| !convoy\.position\) return false;/);
  assert.match(source, /const p = toScreen\(convoy\.position\);/);
  assert.match(source, /drawConvoy\(convoy, p, Number\(convoy\.position\.heading\) \|\| 0\);/);

  assert.doesNotMatch(source, /convoy\.legProgress \/ leg\.distance[\s\S]{0,180}drawConvoy\(convoy/);
});
