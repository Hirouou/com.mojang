import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewCabinBridge } from '../modules/crew-cabin-bridge.js';

test('fail-closed runtime frame releases an occupied cabin station exactly once', () => {
  let occupied = 'aim';
  let releaseCalls = 0;
  let bridge;

  const runtime = {
    update() { throw new Error('transport frame failed'); },
    renderSamples() { return []; },
    releaseStation(station) {
      releaseCalls++;
      if (occupied !== station) return false;
      occupied = null;
      return true;
    },
  };

  const cabin = {
    snapshot() {
      return {
        position: { x: 0, z: 2.4 },
        yaw: 0,
        pitch: 0,
        station: occupied,
      };
    },
    leaveStation() {
      if (!occupied) return true;
      return bridge.releaseStation(occupied);
    },
    updateRemoteCrew() {},
  };

  bridge = createCrewCabinBridge({ runtime, cabin });
  assert.deepEqual(bridge.update(.016, 1), { status: null, remoteCount: 0 });
  assert.equal(releaseCalls, 1, 'the fail-closed path must not send a second release after cabin.leaveStation');
  assert.equal(occupied, null);
});
