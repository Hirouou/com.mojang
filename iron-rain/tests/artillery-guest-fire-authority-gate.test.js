import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const integrationPath = new URL('../modules/integration-live.js', import.meta.url);
const runtimePath = new URL('../modules/crew-runtime.js', import.meta.url);

test('guest fire is intercepted before local click or keyboard presentation', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const intercept = source.slice(source.indexOf('function guestOwnsAim'), source.indexOf('function bindFireState()'));

  assert.match(intercept, /status\?\.mode === 'guest'/, 'only guests should need host acceptance before local presentation');
  assert.match(intercept, /event\.preventDefault\?\.\(\);\s*event\.stopImmediatePropagation\?\.\(\);/, 'the guest intent must stop before game-v6 commits ammo or a projectile');
  assert.match(intercept, /const payload = liveShotPayload\(\);[\s\S]*const result = emitLocalShot\(payload\);/, 'blocked guest intent must snapshot once and reuse the single Mamute fire authority seam');
  assert.match(source, /addEventListener\('click', interceptGuestFireClick, true\)/, 'pointer fire must be intercepted in capture phase');
  assert.match(source, /addEventListener\('keydown', interceptGuestFireKey, true\)/, 'keyboard fire must cross the same capture gate');
  assert.match(intercept, /currentAimBindings\(\)\.fire/, 'custom fire bindings must stay authoritative too');
});

test('accepted local guest fire replays once without issuing a second command', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const replay = source.slice(source.indexOf('function replayAuthoritativeLocalFire'), source.indexOf('function applyCommandResult'));
  const emit = source.slice(source.indexOf('function emitLocalShot'), source.indexOf('function guestOwnsAim'));

  assert.match(source, /effect\.type === 'fire' && effectFromLocalShooter\(effect\)\) \{ replayAuthoritativeLocalFire\(effect\); return; \}/, 'the host echo for the local shooter must become the definitive local presentation');
  assert.match(replay, /clearPendingGuestFire\(\);[\s\S]*authoritativeFireReplay = true;\s*suppressObservedFire = true;/, 'authoritative replay must release the matching lock, bypass the guest intent gate and arm duplicate suppression');
  assert.match(replay, /fire\.click\(\)/, 'accepted fire should reuse the existing fireShell path rather than create a second ballistic simulation');
  assert.match(emit, /if \(suppressObservedFire\) \{ suppressObservedFire = false; return null; \}/, 'the post-commit text observer must not send a duplicate fire command');
  assert.equal((source.match(/issueCommand\('fire'/g) || []).length, 1, 'all fire authority submissions must share one command seam');
});

test('pending guest fire keeps the exact shot identity locked until host acceptance', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const pending = source.slice(source.indexOf('function guestFirePending()'), source.indexOf('function interceptGuestFire(event)'));
  const replay = source.slice(source.indexOf('function replayAuthoritativeLocalFire'), source.indexOf('function applyCommandResult'));

  assert.match(source, /let guestFirePendingShotId = null;/, 'pending authority should be keyed by the requested shot instead of a short wall-clock window');
  assert.match(pending, /return Boolean\(guestFirePendingShotId\);/, 'aim remains locked for the lifetime of the pending authoritative shot');
  assert.match(pending, /closest\?\.\('#fireDeck'\)/, 'pointer changes on the artillery deck must be blocked while a shot is pending');
  assert.match(pending, /bindings\.fire.*bindings\.chargeUp.*bindings\.chargeDown/s, 'fire and both configurable charge keys must be blocked during the pending shot');
  assert.match(pending, /event\.preventDefault\?\.\(\);\s*event\.stopImmediatePropagation\?\.\(\);/s, 'blocked aim changes must stop before game-v6 mutates local controls');
  assert.match(source, /guestFirePendingShotId = payload\.shotId;\s*guestFirePendingCommandSeq = null;\s*const result = emitLocalShot\(payload\);/, 'the exact requested shot identity must arm before authority submission, covering synchronous transports too');
  assert.match(replay, /if \(guestFirePendingShotId && shotId !== guestFirePendingShotId\) return false;\s*clearPendingGuestFire\(\);/, 'only the matching accepted echo may release the lock and commit the local presentation');
  assert.match(source, /maintenanceCadenceState = null; clearPendingGuestFire\(\);/, 'runtime replacement must clear a stranded pending shot without inventing a timeout');
  assert.doesNotMatch(source, /guestFirePendingUntil/, 'the former 1.8 second timeout must not reopen controls before authority responds');
});

test('authoritative rejection releases only the matching pending guest fire request', async () => {
  const [source, runtimeSource] = await Promise.all([readFile(integrationPath, 'utf8'), readFile(runtimePath, 'utf8')]);
  const rejection = source.slice(source.indexOf('function applyCommandResult'), source.indexOf('function applyRemoteEffect'));

  assert.match(runtimeSource, /const commandResultListeners = new Set\(\)/, 'crew runtime should expose its existing command-result authority rather than invent another channel');
  assert.match(runtimeSource, /subscribeCommandResults\(listener\)/, 'live integration needs a bounded subscription to authoritative command results');
  assert.match(source, /runtime\.subscribeCommandResults\?\.\(applyCommandResult\)/, 'artillery integration must consume the runtime result seam');
  assert.match(rejection, /result\?\.authoritative !== true \|\| result\?\.type !== 'fire' \|\| result\?\.ok !== false/, 'pending aim must ignore optimistic and accepted command results');
  assert.match(rejection, /resultShotId === guestFirePendingShotId/, 'rejection may correlate directly by the authoritative shot identity');
  assert.match(rejection, /resultSeq === guestFirePendingCommandSeq/, 'rejection must also correlate by the exact command sequence once known');
  assert.match(rejection, /if \(!sameShot && !sameCommand\) return;\s*clearPendingGuestFire\(\);/, 'an unrelated rejection must never unlock the current shot');
  assert.match(source, /guestFirePendingCommandSeq = Number\.isFinite\(Number\(result\.seq\)\) \? Number\(result\.seq\) : null;/, 'the pending lock should remember the runtime sequence without adding a wall-clock timeout');
});
