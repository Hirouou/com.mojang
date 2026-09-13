import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority } from '../modules/mamute-command-authority.js';
import { createMamuteInventory } from '../modules/mamute-logistics.js';

test('authoritative fire results preserve shotId across acceptance and rejection', () => {
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 1, FRAG: 1 },
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
  assert.equal(accepted.ammoRemaining, 0);

  const duplicate = authority.receive({
    playerId: 'gunner', seq: 2, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:shot-1', shell: 'HE' },
  });
  assert.equal(duplicate.reason, 'duplicate-shot');
  assert.equal(duplicate.shotId, 'mamute-a:gunner:shot-1');

  const empty = authority.receive({
    playerId: 'gunner', seq: 3, type: 'fire',
    payload: { shotId: 'mamute-a:gunner:shot-2', shell: 'HE' },
  });
  assert.equal(empty.reason, 'out-of-ammo');
  assert.equal(empty.shotId, 'mamute-a:gunner:shot-2');
});

test('legacy fire without shotId does not invent a correlation id', () => {
  const authority = createMamuteCommandAuthority({ stationOwner: () => 'gunner' });
  const result = authority.receive({ playerId: 'gunner', seq: 1, type: 'fire', payload: { shell: 'HE' } });
  assert.equal(result.ok, true);
  assert.equal('shotId' in result, false);
});