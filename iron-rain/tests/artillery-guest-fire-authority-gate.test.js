import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const integrationPath = new URL('../modules/integration-live.js', import.meta.url);

test('guest fire is intercepted before local click or keyboard presentation', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const intercept = source.slice(source.indexOf('function guestOwnsAim'), source.indexOf('function bindFireState()'));

  assert.match(intercept, /status\?\.mode === 'guest'/, 'only guests should need host acceptance before local presentation');
  assert.match(intercept, /event\.preventDefault\?\.\(\);\s*event\.stopImmediatePropagation\?\.\(\);/, 'the guest intent must stop before game-v6 commits ammo or a projectile');
  assert.match(intercept, /const result = emitLocalShot\(\);/, 'blocked guest intent must reuse the single Mamute fire authority seam');
  assert.match(source, /addEventListener\('click', interceptGuestFireClick, true\)/, 'pointer fire must be intercepted in capture phase');
  assert.match(source, /addEventListener\('keydown', interceptGuestFireKey, true\)/, 'keyboard fire must cross the same capture gate');
  assert.match(intercept, /restoreBindings\(saved\?\.bindings\)\.fire/, 'custom fire bindings must stay authoritative too');
});

test('accepted local guest fire replays once without issuing a second command', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const replay = source.slice(source.indexOf('function replayAuthoritativeLocalFire'), source.indexOf('function applyRemoteEffect'));
  const emit = source.slice(source.indexOf('function emitLocalShot'), source.indexOf('function guestOwnsAim'));

  assert.match(source, /effect\.type === 'fire' && effectFromLocalShooter\(effect\)\) \{ replayAuthoritativeLocalFire\(effect\); return; \}/, 'the host echo for the local shooter must become the definitive local presentation');
  assert.match(replay, /authoritativeFireReplay = true;\s*suppressObservedFire = true;/, 'authoritative replay must bypass the guest intent gate and arm duplicate suppression');
  assert.match(replay, /fire\.click\(\)/, 'accepted fire should reuse the existing fireShell path rather than create a second ballistic simulation');
  assert.match(emit, /if \(suppressObservedFire\) \{ suppressObservedFire = false; return null; \}/, 'the post-commit text observer must not send a duplicate fire command');
  assert.equal((source.match(/issueCommand\('fire'/g) || []).length, 1, 'all fire authority submissions must share one command seam');
});
