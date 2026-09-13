import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';
import { createMamuteInventory } from '../modules/mamute-logistics.js';

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
  guest.update(pose(-1.5, 1.8, .4), clock.value);
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

test('three crew can own different stations while shared Mamute commands remain owner-authorized', () => {
  const bus = [], clock = { value: 30 }, applied = [], hostEffects = [], gunnerEffects = [], loaderEffects = [];
  const factory = options => new FakeTransport(options, bus);
  const host = createCrewRuntime({
    localId: 'driver',
    now: () => clock.value,
    transportFactory: factory,
    applyMamuteCommand(command) { applied.push(command); return true; },
  });
  const gunner = createCrewRuntime({ localId: 'gunner', now: () => clock.value, transportFactory: factory });
  const loader = createCrewRuntime({ localId: 'loader', now: () => clock.value, transportFactory: factory });
  const fourth = createCrewRuntime({ localId: 'fourth', now: () => clock.value, transportFactory: factory });
  host.subscribeEffects(effect => hostEffects.push(effect));
  gunner.subscribeEffects(effect => gunnerEffects.push(effect));
  loader.subscribeEffects(effect => loaderEffects.push(effect));

  assert.equal(host.host('M47-P0', 'allies').ok, true);
  assert.equal(gunner.join('M47-P0', 'allies').ok, true);
  assert.equal(loader.join('M47-P0', 'allies').ok, true);
  assert.equal(host.status().count, 3);
  assert.equal(gunner.status().seat, 1);
  assert.equal(loader.status().seat, 2);

  assert.equal(fourth.join('M47-P0', 'allies').ok, true);
  assert.equal(fourth.status().connected, false);
  assert.equal(fourth.status().lastEvent, 'denied:mamute-full');
  assert.equal(host.status().count, 3);

  assert.equal(host.claimStation('drive').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);
  assert.equal(loader.claimStation('load').pending, true);
  assert.equal(host.stationOwner('drive'), 'driver');
  assert.equal(host.stationOwner('aim'), 'gunner');
  assert.equal(host.stationOwner('load'), 'loader');
  assert.equal(gunner.stationOwner('aim'), 'gunner');
  assert.equal(loader.stationOwner('load'), 'loader');

  const collision = loader.claimStation('aim');
  assert.equal(collision.pending, true);
  assert.equal(host.stationOwner('aim'), 'gunner');
  assert.equal(loader.stationOwner('aim'), 'gunner');

  assert.equal(host.issueCommand('drive-vector', { throttle: .75, turn: -.2 }).ok, true);
  const gunnerFire = gunner.issueCommand('fire', { shell: 'HE', shotId: 'shot-17', shooterId: 'spoofed-client-id' });
  assert.equal(gunnerFire.ok, true);
  assert.equal(gunnerFire.pending, true);
  assert.deepEqual(hostEffects.map(effect => effect.type), ['fire', 'reload']);
  assert.deepEqual(gunnerEffects.map(effect => effect.type), ['fire', 'reload']);
  assert.deepEqual(loaderEffects.map(effect => effect.type), ['fire', 'reload']);
  assert.equal(hostEffects[0].payload.shotId, 'shot-17');
  assert.equal(hostEffects[0].payload.shooterId, 'gunner');
  assert.equal(loaderEffects[1].payload.shotId, 'shot-17');
  assert.equal(loaderEffects[1].payload.shooterId, 'gunner');

  const loaderReload = loader.issueCommand('reload-shell', { shell: 'HE' });
  assert.equal(loaderReload.ok, true);
  assert.equal(loaderReload.pending, true);

  const illegalFire = loader.issueCommand('fire', { shell: 'HE', shotId: 'illegal-shot' });
  assert.equal(illegalFire.ok, false);
  assert.equal(illegalFire.reason, 'station-not-owned');
  assert.equal(hostEffects.length, 2);
  assert.equal(loaderEffects.length, 2);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map(command => [command.playerId, command.type, command.station]), [
    ['driver', 'drive-vector', 'drive'],
    ['gunner', 'fire', 'aim'],
    ['loader', 'reload-shell', 'load'],
  ]);
});

test('host runtime consumes canonical artillery ammo and returns the final authority result to the guest shooter', () => {
  const bus = [], clock = { value: 50 }, hostEffects = [], gunnerEffects = [], gunnerResults = [];
  const factory = options => new FakeTransport(options, bus);
  const inventory = createMamuteInventory({
    capacity: { HE: 2, SMOKE: 1, FRAG: 1 },
    shells: { HE: 1, SMOKE: 1, FRAG: 1 },
  });
  const host = createCrewRuntime({
    localId: 'driver',
    now: () => clock.value,
    transportFactory: factory,
    fireInventory: () => inventory,
  });
  const gunner = createCrewRuntime({
    localId: 'gunner',
    now: () => clock.value,
    transportFactory: factory,
    onCommandResult(result) { gunnerResults.push(result); },
  });
  host.subscribeEffects(effect => hostEffects.push(effect));
  gunner.subscribeEffects(effect => gunnerEffects.push(effect));

  assert.equal(host.host('M47-AMMO', 'allies').ok, true);
  assert.equal(gunner.join('M47-AMMO', 'allies').ok, true);
  assert.equal(gunner.claimStation('aim').pending, true);
  assert.equal(host.stationOwner('aim'), 'gunner');

  const first = gunner.issueCommand('fire', { shell: 'HE', shotId: 'runtime-ammo-1' });
  assert.equal(first.ok, true);
  assert.equal(first.pending, true);
  assert.equal(inventory.shells.HE, 0);
  assert.deepEqual(hostEffects.map(effect => effect.type), ['fire', 'reload']);
  assert.deepEqual(gunnerEffects.map(effect => effect.type), ['fire', 'reload']);
  const firstResolved = gunnerResults.filter(result => result.authoritative).at(-1);
  assert.equal(firstResolved?.ok, true);
  assert.equal(firstResolved?.type, 'fire');
  assert.equal(firstResolved?.shell, 'HE');
  assert.equal(firstResolved?.ammoRemaining, 0);

  const second = gunner.issueCommand('fire', { shell: 'HE', shotId: 'runtime-ammo-2' });
  assert.equal(second.ok, true);
  assert.equal(second.pending, true);
  assert.equal(inventory.shells.HE, 0);
  assert.equal(hostEffects.length, 2);
  assert.equal(gunnerEffects.length, 2);
  const secondResolved = gunnerResults.filter(result => result.authoritative).at(-1);
  assert.equal(secondResolved?.ok, false);
  assert.equal(secondResolved?.type, 'fire');
  assert.equal(secondResolved?.reason, 'out-of-ammo');
});
