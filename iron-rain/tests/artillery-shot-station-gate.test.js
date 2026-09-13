import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('replicated artillery fire is gated by confirmed aim station ownership', () => {
  assert.match(source, /function canReplicateLocalShot\(runtime\)/);
  assert.match(source, /if \(!status \|\| status\.mode === 'offline'\) return true/);
  assert.match(source, /runtime\.stationOwner\?\.\('aim'\) === status\.localId/);
  assert.match(source, /if \(!runtime\?\.emitEffect \|\| !canReplicateLocalShot\(runtime\)\) return/);
});

test('station gate keeps the single replicated fire and reload path', () => {
  assert.equal((source.match(/runtime\.emitEffect\('fire', shot\)/g) || []).length, 1);
  assert.equal((source.match(/runtime\.emitEffect\('reload', \{ duration: 2\.8, phase: 'extract', shell: shot\.shell \}\)/g) || []).length, 1);
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/);
});
