import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('live artillery fire replicates the committed shot state once', () => {
  assert.match(source, /function liveShotPayload\(\)/);
  assert.match(source, /runtime\.emitEffect\('fire', shot\)/);
  assert.match(source, /shell,\s*\n\s*charge: numericReadout\('chargeValue'\)/);
  assert.match(source, /bearing: numericReadout\('azValue'\)/);
  assert.match(source, /elevation: numericReadout\('elValue'\)/);
  assert.match(source, /ammoRemaining: numericReadout\(ammoId\)/);
  assert.match(source, /runtime\.emitEffect\('reload', \{ duration: 2\.8, phase: 'extract', shell: shot\.shell \}\)/);
});

test('replication reads the live ballistic readouts instead of adding another ballistic table', () => {
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/);
  assert.doesNotMatch(source, /\bballistics\s*\(/);
  assert.match(source, /const firing = text === 'FOGO!' \|\| text === 'EM VOO' \|\| text === 'CARREGANDO'/);
  assert.match(source, /if \(firing && fireArmed\) \{ fireArmed = false; emitLocalShot\(\); \}/);
});
