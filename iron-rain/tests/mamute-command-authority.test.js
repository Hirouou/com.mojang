import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority } from '../modules/mamute-command-authority.js';

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
