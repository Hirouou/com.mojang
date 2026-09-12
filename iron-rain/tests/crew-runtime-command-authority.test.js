import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewRuntime } from '../modules/crew-runtime.js';
import { FACTIONS } from '../modules/factions.js';

function createMemoryCrewBus() {
  const rooms = new Map();
  function transportFactoryFor(clientId) {
    return ({ room, onMessage }) => {
      let active = false;
      const key = String(room);
      return {
        kind: 'memory-test',
        get active() { return active; },
        start() {
          if (active) return true;
          if (!rooms.has(key)) rooms.set(key, new Map());
          rooms.get(key).set(clientId, onMessage);
          active = true;
          return true;
        },
        send(packet) {
          if (!active) return false;
          for (const [peerId, receive] of rooms.get(key) || []) {
            if (peerId === clientId) continue;
            receive(structuredClone(packet));
          }
          return true;
        },
        close() {
          if (!active) return;
          rooms.get(key)?.delete(clientId);
          active = false;
        },
      };
    };
  }
  return { transportFactoryFor };
}

test('three crew can own different stations and host authorizes Mamute commands', () => {
  const bus = createMemoryCrewBus();
  let clock = 10;
  const now = () => clock;
  const mamute = { drive: 0, aim: 0, shell: 'HE', shots: 0 };
  const applied = [];
  const remoteStates = { gunner: [], loader: [] };

  const applyMamuteCommand = command => {
    applied.push({ playerId: command.playerId, type: command.type });
    if (command.type === 'drive-vector') mamute.drive = Number(command.payload?.x) || 0;
    if (command.type === 'aim-delta') mamute.aim += Number(command.payload?.az) || 0;
    if (command.type === 'select-shell') mamute.shell = String(command.payload?.shell || 'HE');
    if (command.type === 'fire') mamute.shots += 1;
    return true;
  };

  const host = createCrewRuntime({
    localId: 'host', now,
    transportFactory: bus.transportFactoryFor('host'),
    applyMamuteCommand,
    mamuteSnapshot: () => ({ ...mamute }),
  });
  const gunner = createCrewRuntime({
    localId: 'gunner', now,
    transportFactory: bus.transportFactoryFor('gunner'),
    onMamuteState: state => remoteStates.gunner.push(state),
  });
  const loader = createCrewRuntime({
    localId: 'loader', now,
    transportFactory: bus.transportFactoryFor('loader'),
    onMamuteState: state => remoteStates.loader.push(state),
  });

  assert.equal(host.host('M47-P0', FACTIONS.ALLIES).ok, true);
  assert.equal(gunner.join('M47-P0', FACTIONS.ALLIES).ok, true);
  assert.equal(loader.join('M47-P0', FACTIONS.ALLIES).ok, true);
  assert.equal(host.status().count, 3);
  assert.equal(gunner.status().connected, true);
  assert.equal(loader.status().connected, true);

  assert.equal(host.claimStation('drive').ok, true);
  gunner.claimStation('aim');
  loader.claimStation('load');
  assert.equal(host.stationOwner('drive'), 'host');
  assert.equal(host.stationOwner('aim'), 'gunner');
  assert.equal(host.stationOwner('load'), 'loader');
  assert.equal(gunner.stationOwner('drive'), 'host');
  assert.equal(loader.stationOwner('aim'), 'gunner');

  assert.equal(host.issueCommand('drive-vector', { x: 0.75 }).ok, true);
  assert.equal(gunner.issueCommand('aim-delta', { az: 3 }).ok, true);
  assert.equal(gunner.issueCommand('fire').ok, true);
  assert.equal(loader.issueCommand('select-shell', { shell: 'SMOKE' }).ok, true);
  assert.equal(gunner.issueCommand('drive-vector', { x: -1 }).ok, false);

  assert.deepEqual(mamute, { drive: 0.75, aim: 3, shell: 'SMOKE', shots: 1 });
  assert.deepEqual(applied.map(entry => entry.type), ['drive-vector', 'aim-delta', 'fire', 'select-shell']);
  assert.ok(remoteStates.gunner.length >= 4);
  assert.ok(remoteStates.loader.length >= 4);
  assert.deepEqual(remoteStates.gunner.at(-1), mamute);
  assert.deepEqual(remoteStates.loader.at(-1), mamute);
});

test('fourth crew member and opposite faction are refused by the same Mamute', () => {
  const bus = createMemoryCrewBus();
  let clock = 20;
  const now = () => clock;
  const runtime = id => createCrewRuntime({ localId: id, now, transportFactory: bus.transportFactoryFor(id) });
  const host = runtime('host');
  const a = runtime('a');
  const b = runtime('b');
  const fourth = runtime('fourth');
  const enemy = runtime('enemy');

  host.host('M47-CAP', FACTIONS.ALLIES);
  a.join('M47-CAP', FACTIONS.ALLIES);
  b.join('M47-CAP', FACTIONS.ALLIES);
  fourth.join('M47-CAP', FACTIONS.ALLIES);
  enemy.join('M47-CAP', FACTIONS.AXIS);

  assert.equal(host.status().count, 3);
  assert.equal(fourth.status().connected, false);
  assert.equal(fourth.status().lastEvent, 'denied:mamute-full');
  assert.equal(enemy.status().connected, false);
  assert.equal(enemy.status().lastEvent, 'denied:faction-mismatch');
});
