import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('pending guest station claim immediately leaves the local station until authority resolves', () => {
  let owner = null;
  let leaves = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
  };
  const cabin = { leaveStation() { leaves++; } };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  const pending = bridge.requestStation('aim');
  assert.equal(pending.pending, true);
  assert.equal(pending.ready, false);
  assert.equal(leaves, 1, 'local renderer must not remain seated while authority is pending');

  owner = 'guest-a';
  const ready = bridge.requestStation('aim');
  assert.equal(ready.ready, true);
  assert.equal(leaves, 1, 'canonical ownership must not eject an authorized station');
});

test('occupied station remains outside locally without sending another claim', () => {
  let leaves = 0;
  let claims = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return 'guest-b'; },
    claimStation() { claims++; return { ok: false }; },
  };
  const cabin = { leaveStation() { leaves++; } };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  const occupied = bridge.requestStation('radio');
  assert.equal(occupied.reason, 'occupied');
  assert.equal(occupied.ready, false);
  assert.equal(claims, 0);
  assert.equal(leaves, 1);
});

test('walking away cancels a pending claim and rejects a late ownership grant', () => {
  let owner = null;
  let focus = { id: 'aim' };
  let releases = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation(station) { releases++; if (owner === 'guest-a') owner = null; return station === 'aim'; },
    update() { return { connected: true }; },
    renderSamples() { return []; },
  };
  const cabin = {
    leaveStation() {},
    snapshot() { return { x: 0, z: 0, yaw: 0, pitch: 0, focus, station: null }; },
    updateRemoteCrew() {},
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.requestStation('aim').pending, true);
  focus = null;
  bridge.update(.016, 1);
  assert.equal(releases, 1, 'leaving the interaction anchor releases the pending intent');

  owner = 'guest-a';
  const late = bridge.stationState('aim');
  assert.equal(late.ready, false, 'late authority must not restore an abandoned station intent');
  assert.equal(late.reason, 'claim-cancelled');
  assert.equal(releases, 2, 'a late ownership grant is released instead of becoming an implicit re-entry');
});