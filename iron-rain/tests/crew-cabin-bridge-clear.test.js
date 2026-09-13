import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('clearing crew bridge releases cabin station before presence is dropped', () => {
  const calls = [];
  const cabin = {
    snapshot: () => null,
    leaveStation() { calls.push('leave-station'); return true; },
    updateRemoteCrew(remotes, dt) { calls.push(['remotes', remotes, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime: {}, cabin });

  bridge.clear();

  assert.equal(calls[0], 'leave-station');
  assert.deepEqual(calls[1], ['remotes', [], 0]);
});

test('clearing crew bridge remains fail-safe if cabin release throws', () => {
  const calls = [];
  const cabin = {
    snapshot: () => null,
    leaveStation() { throw new Error('release failed'); },
    updateRemoteCrew(remotes, dt) { calls.push([remotes, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime: {}, cabin });

  assert.doesNotThrow(() => bridge.clear());
  assert.deepEqual(calls, [[[], 0]]);
});
