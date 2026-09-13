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
  assert.match(intercept, /currentAimBindings\(\)\.fire/, 'custom fire bindings must stay authoritative too');
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

test('pending guest fire freezes aim deck input until the host echo or timeout', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const pending = source.slice(source.indexOf('function guestFirePending()'), source.indexOf('function interceptGuestFire(event)'));

  assert.match(pending, /performance\.now\(\) < guestFirePendingUntil/, 'the existing bounded pending window should remain the lock lifetime');
  assert.match(pending, /closest\?\.\('#fireDeck'\)/, 'pointer changes on the artillery deck must be blocked while a shot is pending');
  assert.match(pending, /bindings\.fire.*bindings\.chargeUp.*bindings\.chargeDown/s, 'fire and both configurable charge keys must be blocked during the pending shot');
  assert.match(pending, /event\.preventDefault\?\.\(\);\s*event\.stopImmediatePropagation\?\.\(\);/s, 'blocked aim changes must stop before game-v6 mutates local controls');
  assert.match(source, /addEventListener\('pointerdown', pendingGuestAimPointer, true\)/, 'handwheel and ammo pointer input must be captured before local handlers');
  assert.match(source, /addEventListener\('pointermove', pendingGuestAimPointer, true\)/, 'an already-held handwheel must not keep drifting during host acceptance');
  assert.match(source, /addEventListener\('keydown', pendingGuestAimKey, true\)/, 'keyboard charge changes must share the same pending lock');
  assert.match(source, /guestFirePendingUntil = 0;/, 'the authoritative local echo must release the pending input lock immediately');
});
