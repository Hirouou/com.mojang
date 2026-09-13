import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority } from '../modules/mamute-command-authority.js';
import { createMamuteInventory } from '../modules/mamute-logistics.js';

test('driver and gunner can operate different stations at the same time', () => {
  const owners = new Map([['drive', 'driver'], ['aim', 'gunner']]);
  const applied = [];
  const authority = createMamuteCommandAuthority({ stationOwner: station => owners.get(station) || null, apply: command => { applied.push(command); return true; } });
  assert.equal(authority.receive({ playerId: 'driver', seq: 1, type: 'drive-vector', payload: { x: 1, y: 0 } }).ok, true);
  assert.equal(authority.receive({ playerId: 'gunner', seq: 1, type: 'aim-delta', payload: { azimuth: .5 } }).ok, true);
  assert.equal(authority.receive({ playerId: 'gunner', seq: 2, type: 'fire' }).ok, true);
  assert.deepEqual(applied.map(command => command.station), ['drive', 'aim', 'aim']);
});

test('crew cannot steal another player station through network commands', () => {
  const owners = new Map([['drive', 'driver'], ['aim', 'gunner']]);
  const authority = createMamuteCommandAuthority({ stationOwner: station => owners.get(station) || null });
  const result = authority.receive({ playerId: 'gunner', seq: 1, type: 'drive-vector', payload: { x: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'station-owned-by-other');
  assert.equal(result.owner, 'driver');
});

test('stale duplicate commands are ignored', () => {
  const authority = createMamuteCommandAuthority({ stationOwner: () => 'driver' });
  assert.equal(authority.receive({ playerId: 'driver', seq: 4, type: 'drive-stop' }).ok, true);
  assert.equal(authority.receive({ playerId: 'driver', seq: 4, type: 'drive-stop' }).reason, 'stale-command');
});

test('fire shotId is idempotent even when transport retries with a newer sequence', () => {
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    apply: command => { applied.push(command); return true; },
  });
  const payload = { shotId: 'mamute-a:gunner:7', shell: 'HE', charge: 4, bearing: 92, elevation: 47 };

  assert.equal(authority.receive({ playerId: 'gunner', seq: 7, type: 'fire', payload }).ok, true);
  const duplicate = authority.receive({ playerId: 'gunner', seq: 8, type: 'fire', payload });

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate-shot');
  assert.equal(applied.length, 1);
  assert.equal(authority.receive({ playerId: 'gunner', seq: 9, type: 'fire', payload: { ...payload, shotId: 'mamute-a:gunner:8' } }).ok, true);
  assert.equal(applied.length, 2);
});

test('legacy fire without shotId remains compatible', () => {
  const authority = createMamuteCommandAuthority({ stationOwner: () => 'gunner' });
  assert.equal(authority.receive({ playerId: 'gunner', seq: 1, type: 'fire', payload: { shell: 'HE' } }).ok, true);
  assert.equal(authority.receive({ playerId: 'gunner', seq: 2, type: 'fire', payload: { shell: 'HE' } }).ok, true);
});

test('rejected fire does not burn shotId before a successful retry', () => {
  let allow = false;
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    apply: command => { applied.push(command); return allow; },
  });
  const payload = { shotId: 'mamute-a:gunner:retry', shell: 'HE' };

  assert.equal(authority.receive({ playerId: 'gunner', seq: 10, type: 'fire', payload }).reason, 'command-rejected');
  allow = true;
  assert.equal(authority.receive({ playerId: 'gunner', seq: 11, type: 'fire', payload }).ok, true);
  assert.equal(authority.receive({ playerId: 'gunner', seq: 12, type: 'fire', payload }).reason, 'duplicate-shot');
  assert.equal(applied.length, 2);
});

test('accepted fire consumes exactly one shell from canonical Mamute inventory', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 4, SMOKE: 2, FRAG: 2 },
    shells: { HE: 2, SMOKE: 1, FRAG: 1 },
  });
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: inventory,
  });
  const payload = { shotId: 'mamute-a:gunner:ammo-1', shell: 'HE' };

  const accepted = authority.receive({ playerId: 'gunner', seq: 20, type: 'fire', payload });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ammoRemaining, 1);
  assert.equal(inventory.shells.HE, 1);

  assert.equal(authority.receive({ playerId: 'gunner', seq: 21, type: 'fire', payload }).reason, 'duplicate-shot');
  assert.equal(inventory.shells.HE, 1);
});

test('fire fails closed on empty canonical inventory without applying the shot', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 2, FRAG: 2 },
    shells: { HE: 0, SMOKE: 1, FRAG: 1 },
  });
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: () => inventory,
    apply: command => { applied.push(command); return true; },
  });

  const result = authority.receive({
    playerId: 'gunner',
    seq: 30,
    type: 'fire',
    payload: { shotId: 'mamute-a:gunner:empty', shell: 'HE' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'out-of-ammo');
  assert.equal(applied.length, 0);
  assert.equal(inventory.shells.HE, 0);
});

test('rejected fire leaves canonical ammo available for retry', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 2, FRAG: 2 },
    shells: { HE: 1, SMOKE: 1, FRAG: 1 },
  });
  let allow = false;
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: inventory,
    apply: () => allow,
  });
  const payload = { shotId: 'mamute-a:gunner:ammo-retry', shell: 'HE' };

  assert.equal(authority.receive({ playerId: 'gunner', seq: 40, type: 'fire', payload }).reason, 'command-rejected');
  assert.equal(inventory.shells.HE, 1);
  allow = true;
  assert.equal(authority.receive({ playerId: 'gunner', seq: 41, type: 'fire', payload }).ok, true);
  assert.equal(inventory.shells.HE, 0);
});

test('fire reserves canonical ammo before apply and restores it when apply rejects', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 1, FRAG: 1 },
    shells: { HE: 1, SMOKE: 1, FRAG: 1 },
  });
  const observedAmmo = [];
  let allow = false;
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: inventory,
    apply: () => { observedAmmo.push(inventory.shells.HE); return allow; },
  });
  const payload = { shotId: 'mamute-a:gunner:atomic-ammo', shell: 'HE' };

  const rejected = authority.receive({ playerId: 'gunner', seq: 50, type: 'fire', payload });
  assert.equal(rejected.reason, 'command-rejected');
  assert.deepEqual(observedAmmo, [0]);
  assert.equal(inventory.shells.HE, 1);

  allow = true;
  const accepted = authority.receive({ playerId: 'gunner', seq: 51, type: 'fire', payload });
  assert.equal(accepted.ok, true);
  assert.deepEqual(observedAmmo, [0, 0]);
  assert.equal(accepted.ammoRemaining, 0);
  assert.equal(inventory.shells.HE, 0);
});
