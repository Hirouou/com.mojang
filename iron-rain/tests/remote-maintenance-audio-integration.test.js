import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('remote maintenance effects use their semantic audio path instead of loader clunks', () => {
  assert.match(source, /effect\.type === 'repair'\) audio\.maintenance\(\{ active: true, kind: 'repair'/);
  assert.match(source, /effect\.type === 'extinguisher'\) audio\.maintenance\(\{ active: true, kind: 'extinguish'/);
  assert.doesNotMatch(source, /effect\.type === 'repair'\) audio\.load/);
  assert.doesNotMatch(source, /effect\.type === 'extinguisher'\) audio\.load/);
});

test('remote maintenance keeps canonical replicated progress as the audio intensity input', () => {
  assert.match(source, /kind: 'repair', progress: effect\.payload\?\.progress/);
  assert.match(source, /kind: 'extinguish', progress: effect\.payload\?\.progress/);
});
