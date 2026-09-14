import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createServerCrewRuntime } from '../modules/server-crew-runtime.js';
import { createServerGameClient } from '../modules/server-game-client.js';

const baseSnapshot = () => ({ ok: true, authority: 'server', revision: 1, sequence: 0, eventHead: 0, time: 0,
  faction: 'allies', theatreId: 'test', wind: { x: 0, y: 0 }, peers: [{ id: 'pilot', seat: 0 }], events: [],
  strategicRevision: 1, strategic: { marker: 'keep-world' }, sectors: [{ id: 'sector' }], tracers: [], support: [],
  mamute: { id: 'own', code: 'ABC', name: 'M74', faction: 'allies', stations: { drive: 'pilot' },
    robot: { x: 100, y: 100, facing: 0, turret: 0, armor: 100 }, bearing: 90, elev: 45, charge: 4,
    ammo: { HE: 18 }, engine: {}, loading: null, loadedShell: 'HE', selectedShell: 'HE' }, mamutes: [] });

async function networkHarness(t) {
  let current = baseSnapshot();
  const requests = [], pending = [], polls = [];
  const runtime = createServerCrewRuntime({ endpoint: 'https://runtime.test',
    storage: { getItem: () => JSON.stringify({ token: 'test-token', playerId: 'pilot' }) },
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/command')) {
        requests.push(body);
        return new Promise((resolve, reject) => pending.push({ body, resolve, reject }));
      }
      if (url.endsWith('/poll')) polls.push(body);
      return { ok: true, json: async () => current };
    },
  });
  await runtime.connect();
  t.after(() => runtime.disconnect());
  return { runtime, requests, pending, polls,
    async reply(extra = {}) {
      const item = pending.shift(); assert.ok(item, 'expected a pending request');
      current = { ...current, revision: current.revision + 1, sequence: item.body.sequence, ...extra };
      item.resolve({ ok: true, json: async () => ({ ok: true, snapshot: current }) });
      await nextTurn();
    },
  };
}

test('slow network replaces obsolete unsent driving input and preserves final stop', async t => {
  const h = await networkHarness(t);
  const promises = [h.runtime.command('drive-vector', { x: 1, y: 0 })];
  for (let i = 0; i < 100; i++) promises.push(h.runtime.command('drive-vector', { x: i / 100, y: 1 }));
  promises.push(h.runtime.command('drive-vector', { x: 0, y: 0 }));
  assert.equal(h.requests.length, 1, 'only one request is in flight');
  await h.reply();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].payload, { x: 0, y: 0 });
  await h.reply();
  assert.ok((await Promise.all(promises)).every(result => result.ok));
  assert.deepEqual(h.requests.map(r => r.sequence), [1, 2]);
});

test('coalescing respects fire and release ordering barriers', async t => {
  const h = await networkHarness(t);
  const promises = [h.runtime.command('drive-vector', { x: 1 })];
  promises.push(h.runtime.command('drive-vector', { x: .5 }));
  promises.push(h.runtime.command('fire'));
  promises.push(h.runtime.command('drive-vector', { x: -.5 }));
  promises.push(h.runtime.command('release'));
  for (let i = 0; i < 5; i++) await h.reply();
  await Promise.all(promises);
  assert.deepEqual(h.requests.map(r => r.type), ['drive-vector', 'drive-vector', 'fire', 'drive-vector', 'release']);
  assert.deepEqual(h.requests.filter(r => r.type === 'drive-vector').map(r => r.payload.x), [1, .5, -.5]);
});

test('accumulated aim is split within authoritative limits entirely before firing', async t => {
  const h = await networkHarness(t);
  const promises = [h.runtime.command('claim', { station: 'aim' })];
  for (let i = 0; i < 10; i++) promises.push(h.runtime.command('aim-delta', { bearing: 4, elevation: 2 }));
  promises.push(h.runtime.command('fire'));
  for (let i = 0; i < 6; i++) await h.reply();
  await Promise.all(promises);
  const aim = h.requests.filter(r => r.type === 'aim-delta');
  assert.equal(aim.length, 4, '40/20 degrees use four bounded commands, not ten packets');
  assert.equal(aim.reduce((sum, r) => sum + r.payload.bearing, 0), 40);
  assert.equal(aim.reduce((sum, r) => sum + r.payload.elevation, 0), 20);
  assert.ok(aim.every(r => Math.abs(r.payload.bearing) <= 12 && Math.abs(r.payload.elevation) <= 8));
  assert.equal(h.requests.at(-1).type, 'fire');
  assert.deepEqual(h.requests.map(r => r.sequence), [1, 2, 3, 4, 5, 6]);
});

test('aim direction reversal remains ordered at the gun elevation limit', async t => {
  const h = await networkHarness(t);
  const promises = [h.runtime.command('claim', { station: 'aim' }), h.runtime.command('aim-delta', { elevation: 8 }), h.runtime.command('aim-delta', { elevation: -8 })];
  for (let i = 0; i < 3; i++) await h.reply();
  await Promise.all(promises);
  assert.deepEqual(h.requests.slice(1).map(r => r.payload.elevation), [8, -8]);
});

test('a lost command response retries the same identity and sequence', async t => {
  const h = await networkHarness(t);
  const fired = h.runtime.command('fire');
  h.pending.shift().reject(new Error('response-lost'));
  await nextTurn();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].id, h.requests[1].id);
  assert.equal(h.requests[0].sequence, h.requests[1].sequence);
  await h.reply(); assert.equal((await fired).ok, true);
});

test('delta responses preserve unchanged world fields and send strategic revision', async t => {
  const h = await networkHarness(t);
  const result = h.runtime.command('claim', { station: 'map' });
  assert.equal(h.requests[0].strategicSince, 1);
  const item = h.pending.shift();
  item.resolve({ ok: true, json: async () => ({ ok: true, snapshot: { ok: true, authority: 'server', revision: 2,
    sequence: 1, eventHead: 0, peers: [{ id: 'pilot' }], events: [], strategicRevision: 1 } }) });
  await result;
  assert.deepEqual(h.runtime.snapshot().strategic, { marker: 'keep-world' });
  assert.deepEqual(h.runtime.snapshot().sectors, [{ id: 'sector' }]);
});

function presentationHarness() {
  let at = 0;
  const state = { robot: {}, cam: {}, sectors: [], tracers: [] }, sent = [];
  let receive;
  const runtime = { command: async (type, payload) => { sent.push({ type, payload }); return { ok: true }; },
    subscribeSnapshots: fn => { receive = fn; return () => {}; }, subscribeEffects: () => () => {},
    stationOwner: () => 'pilot', status: () => ({ localId: 'pilot' }) };
  const client = createServerGameClient({ runtime, getState: () => state, now: () => at });
  return { state, sent, client, apply(snapshot, timestamp = at) { at = timestamp; receive(snapshot); } };
}

test('own and remote motion interpolate but damage is immediate and movement never extrapolates', () => {
  const h = presentationHarness(), a = baseSnapshot();
  a.mamutes = [{ id: 'other', robot: { x: 200, y: 200, facing: Math.PI - .1, turret: 0, armor: 100 } }];
  h.apply(a, 0);
  const b = structuredClone(a); b.mamute.robot.x += 8; b.mamute.robot.armor = 58;
  b.mamutes[0].robot.x += 8; b.mamutes[0].robot.facing = -Math.PI + .1;
  h.apply(b, 200);
  assert.equal(h.state.robot.x, 100); assert.equal(h.state.robot.armor, 58);
  h.client.update(.1, {}, false);
  assert.equal(h.state.robot.x, 104); assert.equal(h.state.serverMamutes[0].robot.x, 204);
  assert.ok(Math.abs(h.state.serverMamutes[0].robot.facing - Math.PI) < .001, 'rotation takes the short arc');
  h.client.update(10, {}, false);
  assert.equal(h.state.robot.x, 108); assert.equal(h.state.serverMamutes[0].robot.x, 208);
  assert.equal(h.state.robot.armor, 58);
  const c = structuredClone(b); c.mamute.robot.x = 20000; h.apply(c, 500);
  assert.equal(h.state.robot.x, 20000, 'respawn/teleport is not animated across the map');
});

test('driver release sends a stop immediately without waiting for the input interval', () => {
  const h = presentationHarness(); h.apply(baseSnapshot());
  h.client.update(.1, { x: 1, y: 0 }, true);
  h.client.update(.001, {}, false);
  assert.deepEqual(h.sent, [{ type: 'drive-vector', payload: { x: 1, y: 0 } }, { type: 'drive-vector', payload: { x: 0, y: 0 } }]);
});
