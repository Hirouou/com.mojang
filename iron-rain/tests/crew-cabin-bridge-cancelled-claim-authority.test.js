import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('cancelled pending station claim preserves a later authoritative remote owner', () => {
  let owner = null;
  let focus = 'drive';
  let claims = 0;
  let releases = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'me' }; },
    stationOwner() { return owner; },
    claimStation() { claims += 1; return { ok: false, pending: true, reason: 'pending-host' }; },
    releaseStation() { releases += 1; return true; },
    update() { return { mode: 'guest', connected: true, localId: 'me' }; },
    renderSamples() { return []; },
  };
  const cabin = {
    snapshot() {
      return {
        position: { x: 0, z: 2.4 },
        yaw: 0,
        pitch: 0,
        focus: focus ? { id: focus } : null,
        station: null,
      };
    },
    leaveStation() {},
    updateRemoteCrew() {},
  };
  const bridge = createCrewCabinBridge({ runtime, cabin });

  assert.equal(bridge.requestStation('drive').reason, 'pending-host');
  assert.equal(claims, 1);

  focus = null;
  bridge.update(.016, 1);
  assert.equal(releases, 1);

  owner = 'other-crew';
  const state = bridge.stationState('drive');
  assert.equal(state.reason, 'occupied');
  assert.equal(state.owner, 'other-crew');
  assert.equal(state.ready, false);

  const retry = bridge.requestStation('drive');
  assert.equal(retry.reason, 'occupied');
  assert.equal(retry.owner, 'other-crew');
  assert.equal(claims, 1);
  assert.equal(releases, 1);
});
