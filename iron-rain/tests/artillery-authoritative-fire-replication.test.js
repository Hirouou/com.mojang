import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';
import { createMamuteInventory } from '../modules/mamute-logistics.js';

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

test('accepted fire replication replaces client ammo with authoritative remaining shells', () => {
  const bus = [];
  const factory = options => new FakeTransport(options, bus);
  const inventory = createMamuteInventory({
    capacity: { HE: 3, SMOKE: 1, FRAG: 1 },
    shells: { HE: 2, SMOKE: 0, FRAG: 0 },
  });
  const observed = [];
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory, fireInventory: inventory });
  const gunner = createCrewRuntime({ localId: 'gunner', transportFactory: factory });
  const observer = createCrewRuntime({ localId: 'observer', transportFactory: factory, onEffect: effect => observed.push(effect) });

  assert.equal(host.host('CANONICAL-FIRE', 'allies').ok, true);
  assert.equal(gunner.join('CANONICAL-FIRE', 'allies').ok, true);
  assert.equal(observer.join('CANONICAL-FIRE', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);

  const sent = gunner.issueCommand('fire', {
    shotId: 'canonical-shot-1',
    shell: 'HE',
    ammoRemaining: 99,
    charge: 4,
    bearing: 18,
    elevation: 41,
  });
  assert.equal(sent.pending, true);

  const fire = observed.find(effect => effect.type === 'fire');
  const reload = observed.find(effect => effect.type === 'reload');
  assert.ok(fire, 'observer should receive the accepted fire effect');
  assert.equal(fire.payload.shotId, 'canonical-shot-1');
  assert.equal(fire.payload.shell, 'HE');
  assert.equal(fire.payload.ammoRemaining, 1, 'host authority should replace the client-reported balance');
  assert.equal(fire.payload.charge, 4, 'presentation-only shot data should still be preserved');
  assert.ok(reload, 'accepted fire should still publish the paired reload effect');
  assert.equal(reload.payload.shotId, 'canonical-shot-1');
  assert.equal(reload.payload.shell, 'HE');
  assert.equal(inventory.shells.HE, 1);
});

test('fire replication omits untrusted ammo when authority has no inventory adapter', () => {
  const bus = [];
  const factory = options => new FakeTransport(options, bus);
  const observed = [];
  const host = createCrewRuntime({ localId: 'host', transportFactory: factory });
  const gunner = createCrewRuntime({ localId: 'gunner', transportFactory: factory });
  const observer = createCrewRuntime({ localId: 'observer', transportFactory: factory, onEffect: effect => observed.push(effect) });

  assert.equal(host.host('CANONICAL-FIRE-NO-AMMO', 'allies').ok, true);
  assert.equal(gunner.join('CANONICAL-FIRE-NO-AMMO', 'allies').ok, true);
  assert.equal(observer.join('CANONICAL-FIRE-NO-AMMO', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);

  gunner.issueCommand('fire', { shotId: 'canonical-shot-2', shell: 'SMOKE', ammoRemaining: 777 });
  const fire = observed.find(effect => effect.type === 'fire');
  assert.ok(fire);
  assert.equal(fire.payload.shotId, 'canonical-shot-2');
  assert.equal(fire.payload.shell, 'SMOKE');
  assert.equal('ammoRemaining' in fire.payload, false, 'replication must not trust a client balance when authority has none');
});
