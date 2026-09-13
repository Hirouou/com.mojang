import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('live artillery replication drops duplicate fire effects by committed shot identity', () => {
  assert.match(source, /createArtilleryShotReplayGuard/, 'live integration should consume the bounded replay guard');
  assert.match(source, /function remoteFireReplayKey\(effect\)/, 'live integration should derive a replay key from committed shot payload');
  assert.match(source, /return String\(effect\?\.payload\?\.shotId \|\| ''\)\.trim\(\);/, 'shotId should be the canonical replay identity even if delivery timestamps differ');
  assert.doesNotMatch(source, /`\$\{shotId\}@\$\{at\}`/, 'delivery time must not split one authoritative shot into multiple replay identities');
  assert.match(source, /if \(effect\.type === 'fire' && !remoteShotReplayGuard\.accept\(remoteFireReplayKey\(effect\)\)\) return;/, 'duplicate fire must be dropped before remote feedback dispatch');
  assert.match(source, /dispatchEvent\(new CustomEvent\('ironrain:shared-crew-effect'/, 'accepted fire must continue through the existing crew feedback seam');
  assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/, 'replication must continue to use upstream readouts instead of a second ballistics source');
});
