import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCabinCrewPresence } from '../modules/crew-presence.js';

test('remote crew presence is capped at two validated visual poses', () => {
  const presence = createCabinCrewPresence();
  const visible = presence.update([
    { id: 'gunner', pose: { x: 0, z: 2.4, yaw: 0, pitch: 0 } },
    { id: 'driver', pose: { x: -.8, z: -2.1, yaw: .5, pitch: -.1 } },
    { id: 'radio', pose: { x: 0, z: 4.5, yaw: 1, pitch: 0 } },
  ]);
  assert.equal(presence.capacity, 2);
  assert.deepEqual(visible.map(entry => entry.id), ['gunner', 'driver']);
  assert.ok(Object.isFrozen(visible));
  assert.ok(visible.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.pose)));
  assert.equal(visible[0].pose.section, 'cabin');
});

test('blocked interpolation holds the last drawable pose instead of clipping through equipment', () => {
  const presence = createCabinCrewPresence();
  const initial = presence.update([
    { id: 'gunner', pose: { x: -2.2, z: -1.2, yaw: 0, pitch: 0 } },
  ])[0].pose;

  const blocked = presence.update([
    {
      id: 'gunner',
      from: { x: -2.2, z: -1.2, yaw: 0, pitch: 0 },
      to: { x: -1.2, z: -1.4, yaw: .8, pitch: .1 },
    },
  ], .5);
  assert.equal(blocked.length, 1);
  assert.strictEqual(blocked[0].pose, initial, 'last valid immutable pose is retained when midpoint is solid');

  const resumed = presence.update([
    {
      id: 'gunner',
      from: { x: -2.2, z: -1.2, yaw: 0, pitch: 0 },
      to: { x: -2, z: -1.2, yaw: .8, pitch: .1 },
    },
  ], .5);
  assert.notStrictEqual(resumed[0].pose, initial);
  assert.ok(resumed[0].pose.x > initial.x);
});

test('remote interpolation never cuts through solid cabin geometry between valid samples', () => {
  const presence = createCabinCrewPresence();
  const from = { x: 1.2330580986681197, z: 2.2216249679768842, yaw: 0, pitch: 0 };
  const to = { x: -1.2381760006677534, z: -0.3154565100262894, yaw: .8, pitch: .1 };
  const initial = presence.update([{ id: 'driver', pose: from }])[0].pose;

  const halfway = presence.update([{ id: 'driver', from, to, alpha: .5 }])[0].pose;
  assert.strictEqual(halfway, initial, 'valid midpoint must not bypass equipment crossed earlier in the segment');

  const completed = presence.update([{ id: 'driver', from, to, alpha: 1 }])[0].pose;
  assert.notStrictEqual(completed, initial, 'completed authoritative sample may snap to its validated endpoint');
  assert.ok(Math.abs(completed.x - to.x) < 1e-9);
  assert.ok(Math.abs(completed.z - to.z) < 1e-9);
});

test('per-peer interpolation alpha from crew replication overrides the fallback blend', () => {
  const presence = createCabinCrewPresence();
  const visible = presence.update([
    {
      id: 'driver', alpha: .25,
      from: { x: -.8, z: -2.1, yaw: 0, pitch: 0 },
      to: { x: -.4, z: -2.1, yaw: .8, pitch: .2 },
    },
    {
      id: 'radio', alpha: .75,
      from: { x: 0, z: 4.5, yaw: 0, pitch: 0 },
      to: { x: 0, z: 4.9, yaw: -.8, pitch: -.2 },
    },
  ], 0);

  assert.ok(Math.abs(visible[0].pose.x + .7) < 1e-9);
  assert.ok(Math.abs(visible[0].pose.yaw - .2) < 1e-9);
  assert.ok(Math.abs(visible[0].pose.pitch - .05) < 1e-9);
  assert.ok(Math.abs(visible[1].pose.z - 4.8) < 1e-9);
  assert.ok(Math.abs(visible[1].pose.yaw + .6) < 1e-9);
  assert.ok(Math.abs(visible[1].pose.pitch + .15) < 1e-9);
});

test('invalid or absent peers never create visual ghosts and cached poses can be cleared', () => {
  const presence = createCabinCrewPresence();
  assert.deepEqual(presence.update([{ id: 'bad', pose: { x: NaN, z: 0, yaw: 0, pitch: 0 } }]), []);
  presence.update([{ id: 'radio', pose: { x: 0, z: 4.5, yaw: 0, pitch: 0 } }]);
  assert.equal(presence.snapshot().length, 1);
  assert.deepEqual(presence.update([]), [], 'omitted peer is hidden immediately');
  presence.clear('radio');
  assert.deepEqual(presence.update([{ id: 'radio', from: null, to: null }], .5), [], 'cleared peer cannot fall back to stale visual state');
});
