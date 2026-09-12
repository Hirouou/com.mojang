import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrewSession, CREW_MAX_PLAYERS } from '../modules/crew-session.js';

const pose = (x = 0, z = 2.4, yaw = 0) => ({ x, z, yaw, pitch: 0 });

function fixture(id, clock) {
  const out = [];
  const session = createCrewSession({ localId: id, now: () => clock.value, send: packet => out.push(packet) });
  return { session, out };
}

function deliver(out, target, filter = () => true) {
  const packets = out.splice(0);
  for (const packet of packets) if (filter(packet)) target.receive(packet);
  return packets;
}

test('host authority admits exactly two remote crew and rejects a fourth player', () => {
  const clock = { value: 10 };
  const host = fixture('host', clock), a = fixture('a', clock), b = fixture('b', clock), c = fixture('c', clock);
  host.session.host('M47A'); host.out.length = 0;

  a.session.join('M47A'); deliver(a.out, host.session);
  deliver(host.out, a.session);
  assert.equal(a.session.status().seat, 1);
  assert.equal(host.session.status().count, 2);

  b.session.join('M47A'); deliver(b.out, host.session);
  const hostPackets = host.out.splice(0);
  for (const packet of hostPackets) { a.session.receive(packet); b.session.receive(packet); }
  assert.equal(b.session.status().seat, 2);
  assert.equal(host.session.status().count, CREW_MAX_PLAYERS);

  c.session.join('M47A'); deliver(c.out, host.session);
  const denial = host.out.find(packet => packet.kind === 'crew-deny' && packet.target === 'c');
  assert.equal(denial?.reason, 'mamute-full');
  c.session.receive(denial);
  assert.match(c.session.status().lastEvent, /^denied:/);
  assert.equal(host.session.status().count, 3);
});

test('crew pose packets stay collision-validated and renderer-ready', () => {
  const clock = { value: 20 };
  const host = fixture('host', clock), guest = fixture('guest', clock);
  host.session.host('ROOM7'); host.out.length = 0;
  guest.session.join('ROOM7'); deliver(guest.out, host.session); deliver(host.out, guest.session);

  guest.session.update(pose(-2.0, 1.8, .4), clock.value);
  const sent = guest.out.find(packet => packet.kind === 'crew-pose');
  assert.ok(sent, 'connected guest emits compact crew pose');
  assert.equal(host.session.receive(sent), true);

  clock.value += .12;
  const samples = host.session.renderSamples(clock.value, 0);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, 'guest');
  assert.equal(samples[0].to.section, 'cabin');
  assert.ok(samples[0].alpha >= 0 && samples[0].alpha <= 1);

  const invalid = { ...sent, seq: sent.seq + 1, pose: { x: 99, z: 99, yaw: 0, pitch: 0 } };
  assert.equal(host.session.receive(invalid), false, 'impossible remote position never reaches renderer');
});

test('cross-device monotonic clock skew is normalized to local receipt time', () => {
  const hostClock = { value: 40 }, guestClock = { value: 9040 };
  const host = fixture('host', hostClock), guest = fixture('guest', guestClock);
  host.session.host('CLOCK'); host.out.length = 0;
  guest.session.join('CLOCK'); deliver(guest.out, host.session); deliver(host.out, guest.session);

  guest.session.update(pose(-2, 1.8, .2), guestClock.value);
  const first = guest.out.find(packet => packet.kind === 'crew-pose');
  assert.ok(first?.at > 9000, 'sender uses a very different local monotonic clock');
  assert.equal(host.session.receive(first), true);

  hostClock.value += .1; guestClock.value += .1; guest.out.length = 0;
  guest.session.update(pose(-1.9, 1.8, .25), guestClock.value);
  const second = guest.out.find(packet => packet.kind === 'crew-pose');
  assert.equal(host.session.receive(second), true);

  hostClock.value += .1;
  const [sample] = host.session.renderSamples(hostClock.value, 0);
  assert.ok(sample.alpha > .9, 'receiver interpolates on its own clock instead of the sender clock');
  assert.ok(sample.at < 100, 'replication stores local receipt time, not remote performance.now()');
});

test('different rooms and unsolicited peers cannot inject crew state', () => {
  const clock = { value: 30 };
  const host = fixture('host', clock);
  host.session.host('ALPHA'); host.out.length = 0;
  assert.equal(host.session.receive({ kind: 'crew-hello', protocol: 1, room: 'BRAVO', sender: 'x' }), false);
  assert.equal(host.session.receive({ kind: 'crew-pose', protocol: 1, room: 'ALPHA', sender: 'intruder', seq: 1, at: 30, pose: pose() }), false);
  assert.equal(host.session.status().count, 1);
});
