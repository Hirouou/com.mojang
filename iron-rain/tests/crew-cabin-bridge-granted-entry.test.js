import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

const cabinPose = focus => ({
  position: { x: 0, z: 2.4 },
  yaw: 0,
  pitch: 0,
  station: null,
  focus: focus ? { id: focus } : null,
});

test('crew cabin bridge completes a pending guest station entry after host ownership arrives', () => {
  let owner = null;
  let interactCalls = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation() { return true; },
    update() { owner = 'guest-a'; return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    renderSamples() { return []; },
  };
  const cabin = {
    snapshot() { return cabinPose('radio'); },
    leaveStation() {},
    interact() { interactCalls++; return 'radio'; },
    updateRemoteCrew() {},
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.requestStation('radio').pending, true);
  assert.equal(interactCalls, 0, 'request remains outside the station until host authority resolves');

  bridge.update(.016, 1);
  assert.equal(interactCalls, 1, 'host grant should finish the still-focused interaction without a second click');
  assert.equal(bridge.stationState('radio').ready, true);

  bridge.update(.016, 2);
  assert.equal(interactCalls, 1, 'resolved pending intent must not replay on later frames');
});

test('crew cabin bridge does not enter a granted station after focus abandons the pending console', () => {
  let owner = null;
  let focus = 'radio';
  let interactCalls = 0;
  let releases = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) { return { ok: false, pending: true, reason: 'pending-host', station, owner: null }; },
    releaseStation() { releases++; return true; },
    update() { owner = 'guest-a'; return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    renderSamples() { return []; },
  };
  const cabin = {
    snapshot() { return cabinPose(focus); },
    leaveStation() {},
    interact() { interactCalls++; return 'radio'; },
    updateRemoteCrew() {},
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.requestStation('radio').pending, true);
  focus = 'engine';
  bridge.update(.016, 1);

  assert.equal(releases, 1, 'moving focus away should cancel the pending claim through the existing authority seam');
  assert.equal(interactCalls, 0, 'a late grant must not pull the player into an abandoned station');
});