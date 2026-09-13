import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';

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

test('fire and reload effects are accepted only from the host authority', () => {
  const bus = [];
  const hostEffects = [];
  const observerEffects = [];
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory, onEffect: effect => hostEffects.push(effect) });
  const gunner = createCrewRuntime({ localId: 'gunner', transportFactory: factory });
  const observer = createCrewRuntime({ localId: 'observer', transportFactory: factory, onEffect: effect => observerEffects.push(effect) });

  assert.equal(host.host('AUTHORITATIVE-EFFECTS', 'allies').ok, true);
  assert.equal(gunner.join('AUTHORITATIVE-EFFECTS', 'allies').ok, true);
  assert.equal(observer.join('AUTHORITATIVE-EFFECTS', 'allies').ok, true);

  assert.equal(gunner.emitEffect('fire', { shotId: 'forged-fire', shell: 'HE' }).ok, true);
  assert.equal(gunner.emitEffect('reload', { shotId: 'forged-fire', shell: 'HE' }).ok, true);
  assert.equal(hostEffects.some(effect => effect.payload?.shotId === 'forged-fire'), false, 'host must ignore guest-authored fire/reload effects');
  assert.equal(observerEffects.some(effect => effect.payload?.shotId === 'forged-fire'), false, 'other guests must ignore guest-authored fire/reload effects');

  assert.equal(gunner.claimStation('aim').pending, true);
  assert.equal(gunner.issueCommand('fire', { shotId: 'accepted-fire', shell: 'HE', charge: 4, bearing: 12, elevation: 43 }).pending, true);

  const acceptedFire = observerEffects.find(effect => effect.type === 'fire' && effect.payload?.shotId === 'accepted-fire');
  const acceptedReload = observerEffects.find(effect => effect.type === 'reload' && effect.payload?.shotId === 'accepted-fire');
  assert.ok(acceptedFire, 'host-authoritative accepted fire should still reach other guests');
  assert.ok(acceptedReload, 'paired authoritative reload should still reach other guests');
  assert.equal(acceptedFire.payload.shooterId, 'gunner');
});

test('non-privileged crew feedback still propagates peer to peer', () => {
  const bus = [];
  const observed = [];
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory });
  const gunner = createCrewRuntime({ localId: 'gunner', transportFactory: factory });
  const observer = createCrewRuntime({ localId: 'observer', transportFactory: factory, onEffect: effect => observed.push(effect) });

  assert.equal(host.host('AUTHORITATIVE-FEEDBACK', 'allies').ok, true);
  assert.equal(gunner.join('AUTHORITATIVE-FEEDBACK', 'allies').ok, true);
  assert.equal(observer.join('AUTHORITATIVE-FEEDBACK', 'allies').ok, true);

  assert.equal(gunner.emitEffect('impact', { intensity: 0.4 }).ok, true);
  assert.equal(observed.some(effect => effect.type === 'impact' && effect.payload?.intensity === 0.4), true);
});
