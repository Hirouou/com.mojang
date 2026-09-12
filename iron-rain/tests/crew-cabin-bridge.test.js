import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('crew cabin bridge publishes only the compact validated local pose then renders remotes', () => {
  const calls = [];
  const cabinSnapshot = {
    position: { x: 0, z: 2.4 },
    yaw: .4,
    pitch: -.1,
    travelled: 3,
    station: 'radio',
    renderer: { drawCalls: 99 },
  };
  const remotes = Object.freeze([{ id: 'peer-b', pose: { x: .5, z: 2.1, yaw: 0, pitch: 0 } }]);
  const runtime = {
    update(pose, at) { calls.push(['runtime.update', pose, at]); return Object.freeze({ mode: 'host' }); },
    renderSamples(at, delay) { calls.push(['runtime.renderSamples', at, delay]); return remotes; },
  };
  const cabin = {
    snapshot() { calls.push(['cabin.snapshot']); return cabinSnapshot; },
    updateRemoteCrew(samples, dt) { calls.push(['cabin.updateRemoteCrew', samples, dt]); },
  };

  const bridge = createCrewCabinBridge({ runtime, cabin, interpolationDelay: .12 });
  const result = bridge.update(.016, 42.5);

  assert.equal(calls[0][0], 'cabin.snapshot');
  assert.equal(calls[1][0], 'runtime.update');
  assert.deepEqual(calls[1][1], { x: 0, z: 2.4, yaw: .4, pitch: -.1, section: 'cabin' });
  assert.equal(calls[1][2], 42.5);
  assert.equal('travelled' in calls[1][1], false);
  assert.equal('station' in calls[1][1], false);
  assert.equal('renderer' in calls[1][1], false);
  assert.deepEqual(calls[2], ['runtime.renderSamples', 42.5, .12]);
  assert.deepEqual(calls[3], ['cabin.updateRemoteCrew', remotes, .016]);
  assert.deepEqual(result, { status: { mode: 'host' }, remoteCount: 1 });
});

test('crew cabin bridge preserves offline rendering when runtime is absent', () => {
  const calls = [];
  const cabin = {
    snapshot() { return { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0 }; },
    updateRemoteCrew(samples, dt) { calls.push([samples, dt]); },
  };

  const bridge = createCrewCabinBridge({ cabin });
  assert.deepEqual(bridge.update(.25), { status: null, remoteCount: 0 });
  assert.deepEqual(calls, [[[], .1]]);
  assert.deepEqual(bridge.stationState('aim'), { ok: true, ready: true, pending: false, reason: 'single-player', station: 'aim', owner: null });
  assert.deepEqual(bridge.requestStation('aim'), { ok: true, ready: true, pending: false, reason: 'single-player', station: 'aim', owner: null });
  assert.equal(bridge.releaseStation('aim'), true);

  bridge.clear();
  assert.deepEqual(calls.at(-1), [[], 0]);
});

test('crew cabin bridge rejects invalid cabin snapshots before runtime publication', () => {
  let published = false;
  const calls = [];
  const runtime = {
    update() { published = true; },
    renderSamples() { return []; },
  };
  const cabin = {
    snapshot() { return { position: { x: Number.NaN, z: 2.4 }, yaw: 0, pitch: 0, station: 'aim' }; },
    updateRemoteCrew(samples, dt) { calls.push([samples, dt]); },
  };

  const result = createCrewCabinBridge({ runtime, cabin }).update(.01, 1);
  assert.equal(published, false);
  assert.deepEqual(result, { status: null, remoteCount: 0 });
  assert.deepEqual(calls, [[[], .01]]);
});

test('crew cabin bridge fails closed when runtime returns a malformed sample collection', () => {
  const calls = [];
  const runtime = {
    update() { return { mode: 'guest' }; },
    renderSamples() { return null; },
  };
  const cabin = {
    snapshot() { return { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0 }; },
    updateRemoteCrew(samples) { calls.push(samples); },
  };

  const result = createCrewCabinBridge({ runtime, cabin }).update(.01, 1);
  assert.equal(result.remoteCount, 0);
  assert.deepEqual(calls, [[]]);
});

test('crew cabin bridge routes station ownership through the canonical runtime gate', () => {
  const calls = [];
  let owner = null;
  const runtime = {
    status() { return { mode: 'host', connected: true, localId: 'player-a' }; },
    stationOwner(station) { calls.push(['owner', station]); return owner; },
    claimStation(station) { calls.push(['claim', station]); owner = 'player-a'; return { ok: true, station, owner }; },
    releaseStation(station) { calls.push(['release', station]); if (owner === 'player-a') { owner = null; return true; } return false; },
  };
  const bridge = createCrewCabinBridge({ runtime });

  assert.deepEqual(bridge.stationState('aim'), { ok: true, ready: false, pending: false, reason: 'available', station: 'aim', owner: null });
  assert.deepEqual(bridge.requestStation('aim'), { ok: true, ready: true, pending: false, reason: 'claimed', station: 'aim', owner: 'player-a' });
  assert.deepEqual(bridge.stationState('aim'), { ok: true, ready: true, pending: false, reason: 'owned', station: 'aim', owner: 'player-a' });
  assert.equal(bridge.releaseStation('aim'), true);
  assert.deepEqual(calls.filter(call => call[0] === 'claim'), [['claim', 'aim']]);
  assert.deepEqual(calls.filter(call => call[0] === 'release'), [['release', 'aim']]);
});

test('crew cabin bridge exposes pending and occupied station states without entering locally', () => {
  const pendingRuntime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return null; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
  };
  const occupiedRuntime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return 'guest-b'; },
    claimStation() { throw new Error('must not claim an occupied station'); },
  };

  assert.deepEqual(createCrewCabinBridge({ runtime: pendingRuntime }).requestStation('radio'), {
    ok: false, ready: false, pending: true, reason: 'pending-host', station: 'radio', owner: null,
  });
  assert.deepEqual(createCrewCabinBridge({ runtime: occupiedRuntime }).requestStation('radio'), {
    ok: false, ready: false, pending: false, reason: 'occupied', station: 'radio', owner: 'guest-b',
  });
});
