import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrewReplication } from '../modules/crew-replication.js';

const pose = (x, z, yaw = 0) => ({ x, z, yaw, pitch: 0 });

test('one Mamute replication state caps crew at one local plus two remotes', () => {
  const crew = createCrewReplication({ localId: 'me' });
  assert.equal(crew.capacity, 3);
  assert.equal(crew.remoteCapacity, 2);
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'a', seq: 1, at: 1, pose: pose(0, 2.4) }), true);
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'b', seq: 1, at: 1, pose: pose(-1, 2.4) }), true);
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'c', seq: 1, at: 1, pose: pose(1, 2.4) }), false);
  assert.equal(crew.snapshot().remotes.length, 2);
});

test('local packets sequence monotonically and reject invalid cabin poses', () => {
  const crew = createCrewReplication({ localId: 'me' });
  assert.equal(crew.localPacket(pose(99, 99), 1), null);
  const first = crew.localPacket(pose(0, 2.4), 1);
  const second = crew.localPacket(pose(.2, 2.4), 2);
  assert.equal(first.seq, 1);
  assert.equal(second.seq, 2);
  assert.equal(first.id, 'me');
  assert.equal(first.kind, 'crew-pose');
});

test('stale and out-of-order packets never rewind a remote player', () => {
  const crew = createCrewReplication({ localId: 'me' });
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'a', seq: 2, at: 2, pose: pose(0, 2.4) }), true);
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'a', seq: 1, at: 3, pose: pose(.4, 2.4) }), false);
  assert.equal(crew.snapshot().remotes[0].seq, 2);
});

test('renderer samples interpolate between latest valid poses and clamp late frames', () => {
  const crew = createCrewReplication({ localId: 'me' });
  crew.receive({ kind: 'crew-pose', id: 'a', seq: 1, at: 1, pose: pose(0, 2.4) });
  crew.receive({ kind: 'crew-pose', id: 'a', seq: 2, at: 1.2, pose: pose(.4, 2.4) });
  const mid = crew.renderSamples(1.2, .1)[0];
  assert.equal(mid.from.x, 0);
  assert.equal(mid.to.x, .4);
  assert.ok(mid.alpha > 0 && mid.alpha < 1);
  const late = crew.renderSamples(9, .1);
  assert.equal(late.length, 0, 'stale peers disappear instead of becoming ghosts');
});

test('self packets, malformed packets and impossible poses are ignored', () => {
  const crew = createCrewReplication({ localId: 'me' });
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'me', seq: 1, at: 1, pose: pose(0, 2.4) }), false);
  assert.equal(crew.receive({ kind: 'other', id: 'a', seq: 1, at: 1, pose: pose(0, 2.4) }), false);
  assert.equal(crew.receive({ kind: 'crew-pose', id: 'a', seq: 1, at: 1, pose: pose(99, 99) }), false);
  assert.equal(crew.snapshot().remotes.length, 0);
});
