import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('live artillery fire submits the committed shot state through command authority once', () => {
  assert.match(source, /function liveShotPayload\(\)/);
  assert.match(source, /runtime\.issueCommand\('fire', liveShotPayload\(\)\)/);
  assert.match(source, /shell,\s*\n\s*charge: numericReadout\('chargeValue'\)/);
  assert.match(source, /bearing: numericReadout\('azValue'\)/);
  assert.match(source, /elevation: numericReadout\('elValue'\)/);
  assert.match(source, /ammoRemaining: numericReadout\(ammoId\)/);
  assert.doesNotMatch(source, /runtime\.emitEffect\('fire'/);
  assert.doesNotMatch(source, /runtime\.emitEffect\('reload'/);
});

test('replication reads the live ballistic readouts instead of adding another ballistic table', () => {
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/);
  assert.doesNotMatch(source, /\bballistics\s*\(/);
  assert.match(source, /const firing = text === 'FOGO!' \|\| text === 'EM VOO'/);
  assert.doesNotMatch(source, /const firing = [^;]*CARREGANDO/);
  assert.match(source, /if \(firing && fireArmed\) \{ fireArmed = false; emitLocalShot\(\); \}/);
});

test('authoritative echo does not replay fire or reload feedback on the original shooter', () => {
  assert.match(source, /function effectFromLocalShooter\(effect\)/);
  assert.match(source, /effect\?\.payload\?\.shooterId/);
  assert.match(source, /\(effect\.type === 'fire' \|\| effect\.type === 'reload'\) && effectFromLocalShooter\(effect\)/);
});