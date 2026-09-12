import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';

class FakeTransport {
  constructor({ room, onMessage }, bus) {
    this.room = room; this.onMessage = onMessage; this.bus = bus; this.active = false; this.kind = 'fake';
  }
  start() { this.active = true; this.bus.push(this); return true; }
  send(packet) { for (const peer of this.bus) if (peer !== this && peer.active && peer.room === this.room) peer.onMessage(packet); return true; }
  close() { this.active = false; const i = this.bus.indexOf(this); if (i >= 0) this.bus.splice(i, 1); }
}

const pose = (x, z, yaw = 0) => ({ x, z, yaw, pitch: 0 });

test('runtime swaps transport without coupling it to cabin state', () => {
  const bus = [], clock = { value: 10 };
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({ localId: 'host', now: () => clock.value, transportFactory: factory });
  const guest = createCrewRuntime({ localId: 'guest', now: () => clock.value, transportFactory: factory });

  assert.equal(host.host('ROOM9').ok, true);
  assert.equal(guest.join('ROOM9').ok, true);
  assert.equal(host.status().count, 2);
  assert.equal(guest.status().connected, true);
  assert.equal(guest.status().seat, 1);

  clock.value += .2;
  host.update(pose(0, 2.4), clock.value);
  guest.update(pose(-2, 1.8, .4), clock.value);
  clock.value += .2;

  assert.equal(host.renderSamples(clock.value, 0).length, 1);
  assert.equal(guest.renderSamples(clock.value, 0).length, 1);
  assert.equal(host.status().transport, 'fake');
  assert.equal(host.status().transportActive, true);

  guest.disconnect();
  assert.equal(guest.status().connected, false);
  assert.equal(host.status().count, 1);
});

test('runtime fails closed when transport cannot start', () => {
  const runtime = createCrewRuntime({ localId: 'x', transportFactory: () => ({ kind: 'broken', active: false, start: () => false, send: () => false, close() {} }) });
  const result = runtime.host('FAIL');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'transport-start-failed');
  assert.equal(runtime.status().connected, false);
});
