import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';
import { CREW_PROTOCOL } from '../modules/crew-session.js';

class FakeTransport {
  constructor({ room, onMessage }, bus) {
    this.room = room;
    this.onMessage = onMessage;
    this.bus = bus;
    this.active = false;
    this.kind = 'fake';
  }
  start() { this.active = true; this.bus.push(this); return true; }
  send(packet) {
    for (const peer of this.bus) if (peer !== this && peer.active && peer.room === this.room) peer.onMessage(packet);
    return true;
  }
  close() {
    this.active = false;
    const index = this.bus.indexOf(this);
    if (index >= 0) this.bus.splice(index, 1);
  }
}

test('guest ignores stale authoritative command results after a newer fire result', () => {
  const bus = [];
  const results = [];
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory });
  const gunner = createCrewRuntime({
    localId: 'gunner',
    transportFactory: factory,
    onCommandResult(result) { results.push(result); },
  });

  assert.equal(host.host('ORDER-1', 'allies').ok, true);
  assert.equal(gunner.join('ORDER-1', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);

  assert.equal(gunner.issueCommand('fire', { shell: 'HE', shotId: 'ordered-1' }).pending, true);
  assert.equal(gunner.issueCommand('fire', { shell: 'HE', shotId: 'ordered-2' }).pending, true);
  assert.equal(results.filter(result => result.authoritative).at(-1)?.seq, 2);

  const authoritativeBeforeReplay = results.filter(result => result.authoritative).length;
  const replayAccepted = gunner.receive({
    kind: 'mamute-command-result',
    protocol: CREW_PROTOCOL,
    room: 'ORDER-1',
    faction: 'allies',
    sender: 'host',
    target: 'gunner',
    seq: 1,
    type: 'fire',
    result: { ok: false, reason: 'out-of-ammo', shotId: 'ordered-1', shell: 'HE' },
  });

  assert.equal(replayAccepted, false);
  assert.equal(results.filter(result => result.authoritative).length, authoritativeBeforeReplay);
  assert.equal(results.filter(result => result.authoritative).at(-1)?.shotId, 'ordered-2');
});

test('command result ordering resets after reconnect', () => {
  const bus = [];
  const results = [];
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory });
  const gunner = createCrewRuntime({ localId: 'gunner', transportFactory: factory, onCommandResult: result => results.push(result) });

  assert.equal(host.host('ORDER-2', 'allies').ok, true);
  assert.equal(gunner.join('ORDER-2', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);
  assert.equal(gunner.issueCommand('fire', { shell: 'HE', shotId: 'before-reconnect' }).pending, true);
  assert.equal(results.filter(result => result.authoritative).at(-1)?.seq, 1);

  gunner.disconnect();
  assert.equal(gunner.join('ORDER-2', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);
  assert.equal(gunner.issueCommand('fire', { shell: 'HE', shotId: 'after-reconnect' }).pending, true);

  const latest = results.filter(result => result.authoritative).at(-1);
  assert.equal(latest?.seq, 1);
  assert.equal(latest?.shotId, 'after-reconnect');
});
