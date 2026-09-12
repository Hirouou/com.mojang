import test from 'node:test';
import assert from 'node:assert/strict';
import { crewLocalPoseFromCabinSnapshot } from '../modules/crew-local-pose.js';

test('crewLocalPoseFromCabinSnapshot emits the shared compact collision-safe pose', () => {
  const source = {
    position: { x: 0, z: 2.4 },
    yaw: Math.PI * 3,
    pitch: 5,
    station: 'aim',
    renderer: { drawCalls: 99 },
  };
  const pose = crewLocalPoseFromCabinSnapshot(source);
  assert.deepEqual(pose, {
    x: 0,
    z: 2.4,
    yaw: Math.PI,
    pitch: .91,
    section: 'cabin',
  });
  assert.ok(Object.isFrozen(pose));
  assert.equal('station' in pose, false);
  assert.equal('renderer' in pose, false);
});

test('crewLocalPoseFromCabinSnapshot fails closed for missing or blocked renderer snapshots', () => {
  assert.equal(crewLocalPoseFromCabinSnapshot(null), null);
  assert.equal(crewLocalPoseFromCabinSnapshot({ position: { x: NaN, z: 0 }, yaw: 0, pitch: 0 }), null);
  assert.equal(crewLocalPoseFromCabinSnapshot({ position: { x: -1.8, z: .7 }, yaw: 0, pitch: 0 }), null);
});
