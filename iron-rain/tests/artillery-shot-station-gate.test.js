import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('replicated artillery fire is gated by confirmed aim station ownership', () => {
  assert.match(source, /function canReplicateLocalShot\(runtime\)/);
  assert.match(source, /if \(!status \|\| status\.mode === 'offline'\) return false/);
  assert.match(source, /runtime\.stationOwner\?\.\('aim'\) === status\.localId/);
  assert.match(source, /if \(!runtime\?\.issueCommand \|\| !canReplicateLocalShot\(runtime\)\) return null/);
});

test('station gate keeps a single authority-submitted fire path', () => {
  assert.equal((source.match(/runtime\.issueCommand\('fire', payload\)/g) || []).length, 1);
  assert.match(source, /function emitLocalShot\(payload = liveShotPayload\(\)\)/);
  assert.doesNotMatch(source, /runtime\.emitEffect\('fire'/);
  assert.doesNotMatch(source, /runtime\.emitEffect\('reload'/);
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/);
});
