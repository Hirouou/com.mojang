import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('crew cabin bridge releases the active station through the cabin path when a runtime frame fails closed', () => {
  const calls = [];
  let station = 'aim';
  const runtime = {
    update() { throw new Error('transport frame failed'); },
    renderSamples() { return []; },
    releaseStation(id) { calls.push(['release', id]); return true; },
  };
  const cabin = {
    snapshot() { return { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0, station }; },
    leaveStation() { calls.push(['leave']); station = null; },
    updateRemoteCrew(samples, dt) { calls.push(['remotes', samples, dt]); },
  };

  const result = createCrewCabinBridge({ runtime, cabin }).update(.02, 1);

  assert.deepEqual(result, { status: null, remoteCount: 0 });
  assert.deepEqual(calls, [
    ['leave'],
    ['remotes', [], .02],
  ], 'cabin leave owns the canonical release and the bridge must not submit it twice');
});

test('crew cabin bridge clear releases the occupied station through the cabin path before clearing remotes', () => {
  const calls = [];
  let station = 'drive';
  const runtime = {
    releaseStation(id) { calls.push(['release', id]); return true; },
  };
  const cabin = {
    snapshot() { return { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0, station }; },
    leaveStation() { calls.push(['leave']); station = null; },
    updateRemoteCrew(samples, dt) { calls.push(['remotes', samples, dt]); },
  };

  createCrewCabinBridge({ runtime, cabin }).clear();

  assert.deepEqual(calls, [
    ['leave'],
    ['remotes', [], 0],
  ], 'clear uses the same single cabin-owned release path');
});
