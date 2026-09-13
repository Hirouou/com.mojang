import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('remote maintenance effects use their semantic audio path instead of loader clunks', () => {
  assert.match(source, /function showRemoteMaintenance\(kind, progress\)/);
  assert.match(source, /audio\.maintenance\(detail\)/);
  assert.match(source, /effect\.type === 'repair'\) showRemoteMaintenance\('repair', effect\.payload\?\.progress\)/);
  assert.match(source, /effect\.type === 'extinguisher'\) showRemoteMaintenance\('extinguish', effect\.payload\?\.progress\)/);
  assert.doesNotMatch(source, /effect\.type === 'repair'\) audio\.load/);
  assert.doesNotMatch(source, /effect\.type === 'extinguisher'\) audio\.load/);
});

test('remote maintenance rebuilds canonical replicated progress into the shared audio and visual contract', () => {
  assert.match(source, /const detail = remoteMaintenanceFeedback\(kind, progress\)/);
  assert.match(source, /if \(!detail\) return/);
  assert.match(source, /dispatchEvent\(new CustomEvent\('iron-rain:maintenance-feedback', \{ detail \}\)\)/);
  assert.match(source, /showRemoteMaintenance\('repair', effect\.payload\?\.progress\)/);
  assert.match(source, /showRemoteMaintenance\('extinguish', effect\.payload\?\.progress\)/);
});