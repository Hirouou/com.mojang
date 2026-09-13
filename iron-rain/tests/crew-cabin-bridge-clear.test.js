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

test('runtime frame failure releases local station before clearing remote presence', () => {
  const calls = [];
  const cabin = {
    snapshot: () => ({ movement: { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0 } }),
    leaveStation() { calls.push('leave-station'); return true; },
    updateRemoteCrew(remotes, dt) { calls.push(['remotes', remotes, dt]); },
  };
  const runtime = {
    update() { throw new Error('transport frame failed'); },
    renderSamples() { return [{ id: 'ghost' }]; },
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  const result = bridge.update(.2, 10);

  assert.deepEqual(result, { status: null, remoteCount: 0 });
  assert.equal(calls[0], 'leave-station');
  assert.deepEqual(calls[1], ['remotes', [], .1]);
});

test('missing runtime frame seam also fails closed instead of preserving stale station input', () => {
  const calls = [];
  const cabin = {
    snapshot: () => ({ movement: { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0 } }),
    leaveStation() { calls.push('leave-station'); return true; },
    updateRemoteCrew(remotes, dt) { calls.push(['remotes', remotes, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime: {}, cabin });

  const result = bridge.update(.016);

  assert.deepEqual(result, { status: null, remoteCount: 0 });
  assert.deepEqual(calls, ['leave-station', ['remotes', [], .016]]);
});
