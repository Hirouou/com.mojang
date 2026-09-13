import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority, MAMUTE_COMMAND_STATION } from '../modules/mamute-command-authority.js';

const ARTILLERY_COMMANDS = Object.freeze({
  'aim-delta': 'aim',
  fire: 'aim',
  'change-charge': 'aim',
  'select-shell': 'load',
  'reload-shell': 'load',
});

test('artillery commands remain bound to their physical crew stations', () => {
  for (const [type, station] of Object.entries(ARTILLERY_COMMANDS)) {
    assert.equal(MAMUTE_COMMAND_STATION[type], station, `${type} must stay gated by ${station}`);
  }
});

test('owned artillery station applies each accepted command exactly once', () => {
  const owners = new Map([['aim', 'gunner'], ['load', 'loader']]);
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: station => owners.get(station) || null,
    apply: command => { applied.push(command); return true; },
  });

  const commands = [
    { playerId: 'gunner', seq: 1, type: 'aim-delta', payload: { azimuth: 0.5, elevation: -0.25 } },
    { playerId: 'gunner', seq: 2, type: 'change-charge', payload: { delta: 1 } },
    { playerId: 'gunner', seq: 3, type: 'fire' },
    { playerId: 'loader', seq: 1, type: 'select-shell', payload: { shell: 'he' } },
    { playerId: 'loader', seq: 2, type: 'reload-shell' },
  ];

  for (const command of commands) assert.equal(authority.receive(command).ok, true);
  assert.deepEqual(applied.map(command => command.type), commands.map(command => command.type));
  assert.equal(applied.length, commands.length);
});

test('wrong crew member, unclaimed station and replay cannot mutate artillery state', () => {
  const owners = new Map([['aim', 'gunner']]);
  let mutations = 0;
  const authority = createMamuteCommandAuthority({
    stationOwner: station => owners.get(station) || null,
    apply: () => { mutations += 1; return true; },
  });

  assert.deepEqual(authority.receive({ playerId: 'loader', seq: 1, type: 'fire' }), {
    ok: false, reason: 'station-owned-by-other', station: 'aim', owner: 'gunner',
  });
  assert.deepEqual(authority.receive({ playerId: 'loader', seq: 2, type: 'reload-shell' }), {
    ok: false, reason: 'station-not-claimed', station: 'load', owner: null,
  });
  assert.equal(authority.receive({ playerId: 'gunner', seq: 1, type: 'fire' }).ok, true);
  assert.deepEqual(authority.receive({ playerId: 'gunner', seq: 1, type: 'fire' }), {
    ok: false, reason: 'stale-command',
  });
  assert.equal(mutations, 1);
});

test('out-of-ammo fire sequence cannot become a live replay after resupply', () => {
  const inventory = { capacity: { HE: 1 }, shells: { HE: 0 } };
  let mutations = 0;
  const authority = createMamuteCommandAuthority({
    stationOwner: station => station === 'aim' ? 'gunner' : null,
    fireInventory: inventory,
    apply: () => { mutations += 1; return true; },
  });
  const command = { playerId: 'gunner', seq: 7, type: 'fire', payload: { shell: 'HE', shotId: 'dry-7' } };

  assert.deepEqual(authority.receive(command), {
    ok: false, reason: 'out-of-ammo', station: 'aim', owner: 'gunner', shell: 'HE', shotId: 'dry-7',
  });
  inventory.shells.HE = 1;
  assert.deepEqual(authority.receive(command), { ok: false, reason: 'stale-command' });
  assert.equal(inventory.shells.HE, 1);
  assert.equal(mutations, 0);
});
