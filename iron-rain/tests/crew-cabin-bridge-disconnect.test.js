import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

const validSnapshot = () => ({ position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0, focus: { id: 'aim' }, station: null });

test('crew cabin bridge clears pending authority and stale remotes as soon as a guest disconnects', () => {
  const calls = [];
  let connected = true;
  const runtime = {
    status() { return { mode: 'guest', connected, localId: 'guest-a' }; },
    stationOwner() { return null; },
    claimStation(station) { calls.push(['claim', station]); return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation(station) { calls.push(['release', station]); return true; },
    update() { return { mode: 'guest', connected, localId: 'guest-a' }; },
    renderSamples() { calls.push(['render']); return [{ id: 'guest-b', pose: { x: .2, z: 2, yaw: 0, pitch: 0 } }]; },
  };
  const cabin = {
    snapshot: validSnapshot,
    leaveStation() { calls.push(['leave']); },
    updateRemoteCrew(samples, dt) { calls.push(['remotes', samples, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.requestStation('aim').pending, true);
  assert.deepEqual(bridge.update(.016, 1), {
    status: { mode: 'guest', connected: true, localId: 'guest-a' },
    remoteCount: 1,
  });

  connected = false;
  const disconnected = bridge.update(.016, 2);
  assert.deepEqual(disconnected, { status: null, remoteCount: 0 });
  assert.equal(calls.filter(call => call[0] === 'render').length, 1, 'disconnect frame must not interpolate stale remote samples');
  assert.deepEqual(calls.filter(call => call[0] === 'release'), [['release', 'aim']], 'pending station claim must be released on disconnect');
  assert.deepEqual(calls.at(-1), ['remotes', [], .016]);
});

test('crew cabin bridge inserts one clean frame when reconnecting under a different local identity', () => {
  const remote = [{ id: 'guest-b', pose: { x: .2, z: 2, yaw: 0, pitch: 0 } }];
  const rendered = [];
  let localId = 'guest-a';
  let renderCalls = 0;
  const runtime = {
    update() { return { mode: 'guest', connected: true, localId }; },
    renderSamples() { renderCalls++; return remote; },
    status() { return { mode: 'guest', connected: true, localId }; },
    stationOwner() { return null; },
    releaseStation() { return true; },
  };
  const cabin = {
    snapshot: validSnapshot,
    leaveStation() {},
    updateRemoteCrew(samples, dt) { rendered.push([samples, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.update(.01, 1).remoteCount, 1);
  localId = 'guest-reconnected';
  assert.deepEqual(bridge.update(.01, 2), { status: null, remoteCount: 0 });
  assert.equal(renderCalls, 1, 'identity rotation must clear the cabin before accepting a new interpolation stream');
  assert.deepEqual(rendered.at(-1), [[], .01]);

  const recovered = bridge.update(.01, 3);
  assert.equal(recovered.remoteCount, 1);
  assert.equal(recovered.status.localId, 'guest-reconnected');
  assert.equal(renderCalls, 2);
});

test('crew cabin bridge clear forgets previous runtime identity for a later clean session', () => {
  let localId = 'guest-a';
  let renderCalls = 0;
  const runtime = {
    update() { return { mode: 'guest', connected: true, localId }; },
    renderSamples() { renderCalls++; return []; },
  };
  const cabin = {
    snapshot: validSnapshot,
    leaveStation() {},
    updateRemoteCrew() {},
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  bridge.update(.01, 1);
  bridge.clear();
  localId = 'guest-b';
  const nextSession = bridge.update(.01, 2);
  assert.equal(nextSession.status.localId, 'guest-b');
  assert.equal(renderCalls, 2, 'explicit clear should allow a different future identity without a synthetic disconnect frame');
});
