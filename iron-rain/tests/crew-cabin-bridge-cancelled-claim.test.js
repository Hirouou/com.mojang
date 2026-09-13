import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('crew cabin bridge keeps an explicitly cancelled pending claim fail-closed against late approval', () => {
  let owner = null;
  let claimCalls = 0;
  let releaseCalls = 0;
  const runtime = {
    status() { return { mode: 'guest', connected: true, localId: 'guest-a' }; },
    stationOwner() { return owner; },
    claimStation(station) {
      claimCalls++;
      return { ok: false, pending: true, reason: 'pending-host', station, owner: null };
    },
    releaseStation() {
      releaseCalls++;
      return true;
    },
  };
  const bridge = createCrewCabinBridge({ runtime });

  assert.equal(bridge.requestStation('radio').pending, true);
  assert.equal(bridge.releaseStation('radio'), true, 'explicit cancellation should reach the canonical release gate');

  owner = 'guest-a';
  const lateApproval = bridge.stationState('radio');
  assert.equal(lateApproval.ready, false, 'late authority approval must not re-seat a cancelled interaction');
  assert.equal(lateApproval.reason, 'claim-cancelled');
  assert.equal(releaseCalls, 2, 'late approval should be released immediately through the canonical gate');

  owner = null;
  assert.equal(bridge.stationState('radio').reason, 'available');
  assert.equal(bridge.requestStation('radio').pending, true, 'a later deliberate interaction may claim the station again');
  assert.equal(claimCalls, 2);
});
