import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority } from '../modules/mamute-command-authority.js';
import { createMamuteInventory } from '../modules/mamute-logistics.js';

test('authoritative fire results preserve shotId across acceptance and exact packet retry', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 1, FRAG: 2 },
    shells: { HE: 1, SMOKE: 0, FRAG: 1 },
  });
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: inventory,
  });

  const accepted = authority.receive({
    playerId: 'gunner', seq: 1, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:shot-1', shell: 'HE' },
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.shotId, 'mamute-a:gunner:shot-1');
  assert.equal(accepted.shell, 'HE');
  assert.equal(accepted.ammoRemaining, 0);

  const duplicate = authority.receive({
    playerId: 'gunner', seq: 1, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:shot-1', shell: 'FRAG' },
  });
  assert.equal(duplicate.reason, 'duplicate-shot');
  assert.equal(duplicate.shotId, 'mamute-a:gunner:shot-1');
  assert.equal(duplicate.shell, 'HE');
  assert.equal(duplicate.ammoRemaining, 0);
  assert.equal(inventory.shells.FRAG, 1);
  assert.equal(authority.snapshot().accepted, 1);

  const empty = authority.receive({
    playerId: 'gunner', seq: 3, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:shot-2', shell: 'HE' },
  });
  assert.equal(empty.reason, 'out-of-ammo');
  assert.equal(empty.shotId, 'mamute-a:gunner:shot-2');
});

test('duplicate fire keeps the ammo balance from the accepted shot result', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 3 },
    shells: { HE: 3 },
  });
  const authority = createMamuteCommandAuthority({
    stationOwner: () => 'gunner',
    fireInventory: inventory,
  });

  const first = authority.receive({
    playerId: 'gunner', seq: 1, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:first', shell: 'HE' },
  });
  assert.equal(first.ammoRemaining, 2);

  const second = authority.receive({
    playerId: 'gunner', seq: 2, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:second', shell: 'HE' },
  });
  assert.equal(second.ammoRemaining, 1);

  const retryFirst = authority.receive({
    playerId: 'gunner', seq: 1, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:first', shell: 'HE' },
  });
  assert.equal(retryFirst.reason, 'duplicate-shot');
  assert.equal(retryFirst.ammoRemaining, 2);
  assert.equal(inventory.shells.HE, 1);
});

test('duplicate fire keeps the owner from the accepted shot after AIM handoff', () => {
  let owner = 'gunner';
  const authority = createMamuteCommandAuthority({ stationOwner: () => owner });
  const payload = { shotId: 'mamute-a:gunner:handoff', shell: 'HE' };

  const accepted = authority.receive({ playerId: 'gunner', seq: 1, type: 'fire', payload });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.owner, 'gunner');

  owner = 'other-gunner';
  const duplicate = authority.receive({ playerId: 'gunner', seq: 1, type: 'fire', payload });
  assert.equal(duplicate.reason, 'duplicate-shot');
  assert.equal(duplicate.owner, 'gunner');
  assert.equal(duplicate.shotId, payload.shotId);
});

test('authoritative fire keeps accepted shell identity without an inventory adapter', () => {
  const authority = createMamuteCommandAuthority({ stationOwner: () => 'gunner' });
  const payload = { shotId: 'mamute-a:gunner:no-inventory', shell: 'SMOKE' };

  const accepted = authority.receive({ playerId: 'gunner', seq: 10, type: 'fire', payload });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.shotId, payload.shotId);
  assert.equal(accepted.shell, 'SMOKE');
  assert.equal('ammoRemaining' in accepted, false);

  const duplicate = authority.receive({
    playerId: 'gunner', seq: 10, type: 'fire',
    payload: { ...payload, shell: 'HE' },
  });
  assert.equal(duplicate.reason, 'duplicate-shot');
  assert.equal(duplicate.shotId, payload.shotId);
  assert.equal(duplicate.shell, 'SMOKE');
  assert.equal('ammoRemaining' in duplicate, false);
});

test('station ownership rejection keeps the denied fire shotId authoritative', () => {
  let owner = null;
  const authority = createMamuteCommandAuthority({ stationOwner: () => owner });

  const unclaimed = authority.receive({
    playerId: 'gunner', seq: 1, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:preclaim', shell: 'HE' },
  });
  assert.equal(unclaimed.reason, 'station-not-claimed');
  assert.equal(unclaimed.shotId, 'mamute-a:gunner:preclaim');

  owner = 'other-gunner';
  const occupied = authority.receive({
    playerId: 'gunner', seq: 2, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:occupied', shell: 'HE' },
  });
  assert.equal(occupied.reason, 'station-owned-by-other');
  assert.equal(occupied.shotId, 'mamute-a:gunner:occupied');
});

test('legacy fire without shotId does not invent a correlation id', () => {
  const authority = createMamuteCommandAuthority({ stationOwner: () => 'gunner' });
  const result = authority.receive({ playerId: 'gunner', seq: 1, type: 'fire', payload: { shell: 'HE' } });
  assert.equal(result.ok, true);
  assert.equal(result.shell, 'HE');
  assert.equal('shotId' in result, false);
});