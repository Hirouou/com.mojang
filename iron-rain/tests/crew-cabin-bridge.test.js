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
  const offline = bridge.requestStation('aim');
  assert.deepEqual(bridge.stationState('aim'), { ok: true, ready: true, pending: false, reason: 'single-player', station: 'aim', owner: null });
  assert.deepEqual(offline, { ok: true, ready: true, pending: false, reason: 'single-player', station: 'aim', owner: null });
  assert.equal(bridge.stationMessage(offline), '');
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

test('crew cabin bridge contains transient runtime frame failures and clears stale remotes', () => {
  const calls = [];
  let failAt = 'update';
  const runtime = {
    update() {
      if (failAt === 'update') throw new Error('transport frame failed');
      return { mode: 'guest', connected: true };
    },
    renderSamples() {
      if (failAt === 'render') throw new Error('sample interpolation failed');
      return [{ id: 'peer-b', pose: { x: 0, z: 2.4, yaw: 0, pitch: 0 } }];
    },
  };
  const cabin = {
    snapshot() { return { position: { x: 0, z: 2.4 }, yaw: 0, pitch: 0 }; },
    updateRemoteCrew(samples, dt) { calls.push([samples, dt]); },
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.deepEqual(bridge.update(.02, 1), { status: null, remoteCount: 0 });
  assert.deepEqual(calls.at(-1), [[], .02]);

  failAt = 'render';
  assert.deepEqual(bridge.update(.03, 2), { status: null, remoteCount: 0 });
  assert.deepEqual(calls.at(-1), [[], .03]);

  failAt = null;
  assert.deepEqual(bridge.update(.04, 3), { status: { mode: 'guest', connected: true }, remoteCount: 1 });
  assert.equal(calls.at(-1)[0].length, 1, 'bridge should recover on the next healthy frame');
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
  const claimed = bridge.requestStation('aim');
  assert.deepEqual(claimed, { ok: true, ready: true, pending: false, reason: 'claimed', station: 'aim', owner: 'player-a' });
  assert.equal(bridge.stationMessage(claimed), '');
  assert.deepEqual(bridge.stationState('aim'), { ok: true, ready: true, pending: false, reason: 'owned', station: 'aim', owner: 'player-a' });
  assert.equal(bridge.releaseStation('aim'), true);
  assert.deepEqual(calls.filter(call => call[0] === 'claim'), [['claim', 'aim']]);
  assert.deepEqual(calls.filter(call => call[0] === 'release'), [['release', 'aim']]);
});

test('crew cabin bridge exposes pending and occupied station feedback without entering locally', () => {
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

  const pendingBridge = createCrewCabinBridge({ runtime: pendingRuntime });
  const pending = pendingBridge.requestStation('radio');
  assert.deepEqual(pending, {
    ok: false, ready: false, pending: true, reason: 'pending-host', station: 'radio', owner: null,
  });
  assert.equal(pendingBridge.stationMessage(pending), 'AGUARDANDO CONFIRMAÇÃO DO POSTO');

  const occupiedBridge = createCrewCabinBridge({ runtime: occupiedRuntime });
  const occupied = occupiedBridge.requestStation('radio');
  assert.deepEqual(occupied, {
    ok: false, ready: false, pending: false, reason: 'occupied', station: 'radio', owner: 'guest-b',
  });
  assert.equal(occupiedBridge.stationMessage(occupied), 'POSTO OCUPADO POR OUTRO TRIPULANTE');
});

test('crew cabin bridge keeps a guest claim pending until canonical ownership resolves', () => {
  let owner = null;
  let connected = true;
  let claimCalls = 0;
  const runtime = {
    status() { return { mode: 'guest', connected, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { claimCalls++; return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation() { return false; },
  };
  const bridge = createCrewCabinBridge({ runtime });

  assert.equal(bridge.requestStation('radio').pending, true);
  assert.deepEqual(bridge.stationState('radio'), {
    ok: false, ready: false, pending: true, reason: 'pending-host', station: 'radio', owner: null,
  });
  assert.equal(bridge.requestStation('radio').pending, true);
  assert.equal(claimCalls, 1, 'pending UI state must not resend duplicate claims');

  owner = 'guest-a';
  assert.deepEqual(bridge.stationState('radio'), {
    ok: true, ready: true, pending: false, reason: 'owned', station: 'radio', owner: 'guest-a',
  });

  owner = null;
  bridge.requestStation('radio');
  connected = false;
  assert.deepEqual(bridge.stationState('radio'), {
    ok: false, ready: false, pending: false, reason: 'not-connected', station: 'radio', owner: null,
  });
});

test('crew cabin bridge resolves host denial instead of leaving a guest claim pending forever', () => {
  let lastEvent = 'joined';
  let claimCalls = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a', lastEvent }; },
    stationOwner() { return null; },
    claimStation(station) {
      claimCalls++;
      lastEvent = `station-request:${station}`;
      return { ok: false, pending: true, reason: 'pending-host', station, owner: null };
    },
  };
  const bridge = createCrewCabinBridge({ runtime });

  assert.equal(bridge.requestStation('radio').pending, true);
  lastEvent = 'station-denied:radio:guest-b';
  const occupied = bridge.stationState('radio');
  assert.deepEqual(occupied, {
    ok: false, ready: false, pending: false, reason: 'occupied', station: 'radio', owner: 'guest-b',
  });
  assert.equal(bridge.stationMessage(occupied), 'POSTO OCUPADO POR OUTRO TRIPULANTE');

  lastEvent = 'stations-updated';
  assert.equal(bridge.requestStation('radio').pending, true, 'a later interaction may retry after the denial was consumed');
  assert.equal(claimCalls, 2);
  lastEvent = 'station-denied:radio:';
  const denied = bridge.stationState('radio');
  assert.equal(denied.reason, 'claim-denied');
  assert.equal(denied.pending, false);
  assert.equal(bridge.stationMessage(denied), 'POSTO INDISPONÍVEL');
});

test('crew cabin bridge keeps a pending claim blocked when release is not confirmed', () => {
  let owner = null;
  let releaseAllowed = false;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation() { return releaseAllowed; },
  };
  const bridge = createCrewCabinBridge({ runtime });

  assert.equal(bridge.requestStation('radio').pending, true);
  assert.equal(bridge.releaseStation('radio'), false);
  assert.deepEqual(bridge.stationState('radio'), {
    ok: false, ready: false, pending: true, reason: 'pending-host', station: 'radio', owner: null,
  });

  owner = 'guest-a';
  assert.equal(bridge.stationState('radio').ready, true, 'late host approval must still surface after an unconfirmed release');
  releaseAllowed = true;
  assert.equal(bridge.releaseStation('radio'), true);
});
