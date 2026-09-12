import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('crew cabin bridge publishes local pose then renders remote samples in the same frame', () => {
  const calls = [];
  const localPose = { x: 1.25, z: -2.5, yaw: .4, pitch: -.1, travelled: 3 };
  const remotes = Object.freeze([{ id: 'peer-b', from: localPose, to: { ...localPose, x: 2 }, alpha: .5 }]);
  const runtime = {
    update(pose, at) { calls.push(['runtime.update', pose, at]); return Object.freeze({ mode: 'host' }); },
    renderSamples(at, delay) { calls.push(['runtime.renderSamples', at, delay]); return remotes; },
  };
  const cabin = {
    snapshot() { calls.push(['cabin.snapshot']); return localPose; },
    updateRemoteCrew(samples, dt) { calls.push(['cabin.updateRemoteCrew', samples, dt]); },
  };

  const bridge = createCrewCabinBridge({ runtime, cabin, interpolationDelay: .12 });
  const result = bridge.update(.016, 42.5);

  assert.deepEqual(calls, [
    ['cabin.snapshot'],
    ['runtime.update', localPose, 42.5],
    ['runtime.renderSamples', 42.5, .12],
    ['cabin.updateRemoteCrew', remotes, .016],
  ]);
  assert.deepEqual(result, { status: { mode: 'host' }, remoteCount: 1 });
});

test('crew cabin bridge preserves offline/single-player rendering when runtime is absent', () => {
  const calls = [];
  const cabin = {
    snapshot() { return { x: 0, z: 0, yaw: 0, pitch: 0, travelled: 0 }; },
    updateRemoteCrew(samples, dt) { calls.push([samples, dt]); },
  };

  const bridge = createCrewCabinBridge({ cabin });
  assert.deepEqual(bridge.update(.25), { status: null, remoteCount: 0 });
  assert.deepEqual(calls, [[[], .1]]);

  bridge.clear();
  assert.deepEqual(calls.at(-1), [[], 0]);
});

test('crew cabin bridge fails closed when runtime returns a malformed sample collection', () => {
  const calls = [];
  const runtime = {
    update() { return { mode: 'guest' }; },
    renderSamples() { return null; },
  };
  const cabin = {
    snapshot() { return { x: 0, z: 0, yaw: 0, pitch: 0, travelled: 0 }; },
    updateRemoteCrew(samples) { calls.push(samples); },
  };

  const result = createCrewCabinBridge({ runtime, cabin }).update(.01, 1);
  assert.equal(result.remoteCount, 0);
  assert.deepEqual(calls, [[]]);
});
