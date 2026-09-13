import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteCommandAuthority } from '../modules/mamute-command-authority.js';

test('fire rejected before AIM ownership cannot replay into a later claim', () => {
  let owner = null;
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: station => station === 'aim' ? owner : null,
    apply: command => { applied.push(command); return true; },
  });
  const command = {
    playerId: 'gunner',
    seq: 7,
    type: 'fire',
    payload: { shotId: 'mamute-a:gunner:preclaim-7', shell: 'HE' },
  };

  const beforeClaim = authority.receive(command);
  assert.equal(beforeClaim.ok, false);
  assert.equal(beforeClaim.reason, 'station-not-claimed');
  assert.equal(applied.length, 0);

  owner = 'gunner';
  const replay = authority.receive(command);
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'stale-command');
  assert.equal(applied.length, 0);

  const fresh = authority.receive({
    ...command,
    seq: 8,
    payload: { ...command.payload, shotId: 'mamute-a:gunner:preclaim-8' },
  });
  assert.equal(fresh.ok, true);
  assert.equal(applied.length, 1);
});

test('fire rejected while another player owns AIM cannot replay after handoff', () => {
  let owner = 'other-gunner';
  const applied = [];
  const authority = createMamuteCommandAuthority({
    stationOwner: station => station === 'aim' ? owner : null,
    apply: command => { applied.push(command); return true; },
  });
  const command = {
    playerId: 'gunner',
    seq: 12,
    type: 'fire',
    payload: { shotId: 'mamute-a:gunner:handoff-12', shell: 'HE' },
  };

  assert.equal(authority.receive(command).reason, 'station-owned-by-other');
  owner = 'gunner';
  assert.equal(authority.receive(command).reason, 'stale-command');
  assert.equal(applied.length, 0);

  assert.equal(authority.receive({
    ...command,
    seq: 13,
    payload: { ...command.payload, shotId: 'mamute-a:gunner:handoff-13' },
  }).ok, true);
  assert.equal(applied.length, 1);
});
