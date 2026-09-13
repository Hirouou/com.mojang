import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('live artillery replication pairs reload identity with the accepted shot', () => {
  assert.match(source, /const remoteReloadReplayGuard = createArtilleryShotReplayGuard\(64\);/, 'reload replication should use its own bounded replay guard');
  assert.match(source, /function remoteReloadReplayKey\(effect\)/, 'reload effects should derive replay identity from the committed shot');
  assert.match(source, /if \(effect\.type === 'reload' && !remoteReloadReplayGuard\.accept\(remoteReloadReplayKey\(effect\)\)\) return;/, 'duplicate reload effects must be dropped before shared crew feedback');
  assert.match(source, /runtime\.emitEffect\('reload', \{ shotId: shot\.shotId, at: shot\.at, duration: 2\.8, phase: 'extract', shell: shot\.shell \}\);/, 'reload replication should carry the fire identity instead of becoming an anonymous second event');
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/, 'reload dedupe must not introduce a second ballistics source');
});
