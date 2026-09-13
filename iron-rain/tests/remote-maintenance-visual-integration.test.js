import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('remote maintenance reuses canonical cabin feedback without network echo', () => {
  assert.match(source, /function showRemoteMaintenance\(kind, progress\)/);
  assert.match(source, /remote:\s*true/);
  assert.match(source, /iron-rain:maintenance-feedback/);
  assert.match(source, /effect\.type === 'repair'\) showRemoteMaintenance\('repair'/);
  assert.match(source, /effect\.type === 'extinguisher'\) showRemoteMaintenance\('extinguish'/);
  assert.match(source, /if \(event\.detail\?\.remote\) return;/);
});
