import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWarAuthority } from '../server/world.mjs';
import { openWarStore } from '../server/store.mjs';
import { startWarServer } from '../server/http.mjs';

function fixture(t) {
  let wall = 1000000;
  const store = openWarStore(':memory:'), world = createWarAuthority({ store, now: () => wall });
  t.after(() => store.close());
  const request = (p, type, payload = {}) => ({ id: randomUUID(), sequence: (p.sequence || 0) + 1, type, payload });
  const command = (p, type, payload) => world.command(p, request(p, type, payload));
  const player = (faction = 'allies', m = null) => {
    const identity = world.register(), p = world.authenticate(identity.token); world.heartbeat(p);
    assert.equal(command(p, m ? 'join' : 'create', m ? { faction, code: m.code } : { faction }).ok, true);
    return p;
  };
  const park = p => {
    const m = world.state.mamutes[p.mamuteId];
    const [id] = [...world.theatre.territory].find(([, node]) => node.owner === (p.faction === 'axis' ? 'enemy' : 'ally') && !node.contested && node.structures.includes('depot'));
    const source = world.theatre.logistics.getNode(id);
    Object.assign(m.robot, { x: source.x, y: source.y, speed: 0 }); m.engine.fire = 0; m.ammo.HE = 0;
    source.stock.ammo = 12; world.heartbeat(p, { x: 0, z: 3.4, yaw: 0, pitch: 0 });
    return { m, source };
  };
  const advancePoseClock = seconds => {
    wall += seconds * 1000; world.state.time += seconds; world.state.wallMs = wall;
    for (const p of Object.values(world.state.players)) world.heartbeat(p);
  };
  const walk = (p, x, z) => {
    while (Math.hypot(x - p.exterior.x, z - p.exterior.z) > .001) {
      const dx = x - p.exterior.x, dz = z - p.exterior.z, distance = Math.hypot(dx, dz), length = Math.min(4, distance);
      advancePoseClock(1);
      const result = world.heartbeat(p, undefined, { x: p.exterior.x + dx * length / distance, z: p.exterior.z + dz * length / distance, yaw: 0, pitch: 0 });
      assert.notEqual(result.exteriorPoseAccepted, false, result.exteriorReason);
    }
  };
  const rack = p => { walk(p, -12, 8); walk(p, -12, 0); };
  const rear = p => { walk(p, -12, 8); walk(p, 0, 8); };
  return { world, store, request, command, player, park, rack, rear, advancePoseClock,
    advance(seconds) { wall += seconds * 1000; world.advance(); }, now: () => wall };
}

test('outside crew remains in capacity, leaves the cabin projection and blocks traction without evicting pilot', t => {
  const f = fixture(t), passenger = f.player(), { m } = f.park(passenger), pilot = f.player('allies', m);
  f.world.heartbeat(pilot, { x: -.6, z: -2, yaw: 0, pitch: 0 });
  assert.equal(f.command(pilot, 'claim', { station: 'drive' }).ok, true);
  const exit = f.request(passenger, 'exit-base');
  assert.equal(f.world.command(passenger, exit).ok, true);
  assert.deepEqual(f.world.command(passenger, exit), passenger.receipts[exit.id]);
  const snapshot = f.world.snapshot(pilot);
  assert.equal(snapshot.peers.length, 2);
  assert.equal(snapshot.peers.find(p => p.id === passenger.id).exterior, true);
  assert.equal(snapshot.peers.find(p => p.id === passenger.id).pose, null);
  assert.equal(f.command(pilot, 'drive-vector', { x: 1, y: 0 }).reason, 'crew-outside');
  assert.equal(m.stations.drive, pilot.id);
  assert.equal(f.command(passenger, 'claim', { station: 'aim' }).reason, 'operator-outside');
  assert.equal(f.command(passenger, 'fire').reason, 'operator-outside');
  assert.equal(f.command(passenger, 'engine-service').reason, 'operator-outside');
});

test('world receipts deduplicate finite pickup/deposit and returntrip reload stays within capacity', t => {
  const f = fixture(t), p = f.player(), { m, source } = f.park(p);
  m.ammo.HE = 16; f.command(p, 'exit-base'); f.rack(p);
  const pickup = f.request(p, 'pickup-ammo', { shell: 'HE' });
  assert.equal(f.world.command(p, pickup).ok, true); assert.equal(source.stock.ammo, 9);
  assert.equal(f.world.command(p, pickup).ok, true); assert.equal(source.stock.ammo, 9);
  f.rear(p);
  const deposit = f.request(p, 'deposit-ammo');
  assert.equal(f.world.command(p, deposit).amount, 2); assert.equal(m.ammo.HE, 18);
  assert.equal(f.world.command(p, deposit).amount, 2); assert.equal(m.ammo.HE, 18); assert.equal(p.exterior.carry.amount, 1);
  f.rack(p); assert.equal(f.command(p, 'return-ammo').ok, true); assert.equal(source.stock.ammo, 10);
  f.rear(p); assert.equal(f.command(p, 'enter-mamute').ok, true);
  assert.equal(f.world.snapshot(p).baseService.outside, false);
});

test('durable restart/reconnect preserves carried cargo; explicit Mamute switch refunds once', t => {
  const f = fixture(t), p = f.player(), { source } = f.park(p);
  f.command(p, 'exit-base'); f.rack(p); f.command(p, 'pickup-ammo'); f.world.disconnect(p);
  const resumed = createWarAuthority({ store: f.store, now: f.now }), restored = resumed.state.players[p.id];
  resumed.heartbeat(restored);
  assert.equal(resumed.snapshot(restored).baseService.carry.amount, 3);
  assert.equal(resumed.theatre.logistics.getNode(source.id).stock.ammo, 9);
  const req = { id: randomUUID(), sequence: restored.sequence + 1, type: 'create', payload: { faction: 'allies' } };
  assert.equal(resumed.command(restored, req).ok, true);
  assert.equal(restored.exterior, null); assert.equal(resumed.theatre.logistics.getNode(source.id).stock.ammo, 12);
  resumed.command(restored, req); assert.equal(resumed.theatre.logistics.getNode(source.id).stock.ammo, 12);
});

test('shared Mamute respawn returns every carried box and brings the crew inside together', t => {
  const f = fixture(t), a = f.player(), { m, source } = f.park(a), b = f.player('allies', m);
  f.world.heartbeat(b, { x: 0, z: 3.4, yaw: 0, pitch: 0 });
  for (const p of [a, b]) { f.command(p, 'exit-base'); f.rack(p); f.command(p, 'pickup-ammo'); }
  assert.equal(source.stock.ammo, 6);
  f.world.damage(m, 100);
  f.advancePoseClock(16);
  assert.equal(f.command(a, 'respawn').ok, true);
  assert.equal(a.exterior, null); assert.equal(b.exterior, null); assert.equal(source.stock.ammo, 12);
  assert.equal(m.destroyed, false); assert.equal(m.robot.armor, 100);
});

test('driving tolerates one-second RTT while explicit stop and expired lease remain authoritative', t => {
  const f = fixture(t), p = f.player(), { m } = f.park(p);
  f.world.heartbeat(p, { x: -.6, z: -2, yaw: 0, pitch: 0 }); f.command(p, 'claim', { station: 'drive' });
  f.command(p, 'drive-vector', { x: 1, y: 0 }); const initial = m.robot.x;
  f.advance(1); assert.ok(m.robot.x > initial + 34, 'lease must not stop after .75s');
  f.command(p, 'drive-stop'); const stopped = m.robot.x; f.advance(.3); assert.equal(m.robot.x, stopped);
  f.command(p, 'drive-vector', { x: 1, y: 0 }); f.advance(2); const expired = m.robot.x;
  f.advance(.3); assert.equal(m.robot.x, expired);
});

test('world tick produces earned team-scoped recon and no reports for unselected faction', t => {
  const f = fixture(t), ally = f.player(), enemy = f.player('axis');
  const sector = f.world.state.battlefield.sectors[0];
  for (const p of [ally, enemy]) Object.assign(f.world.state.mamutes[p.mamuteId].robot, { x: sector.x, y: sector.y });
  f.advance(.2);
  const reports = f.world.snapshot(ally).recon.reports;
  assert.ok(reports.length > 0); assert.ok(reports.every(r => r.team === 'ally'));
  assert.ok(f.world.snapshot(enemy).recon.reports.every(r => r.team === 'enemy'));
  const identity = f.world.register(), spectator = f.world.authenticate(identity.token); f.world.heartbeat(spectator);
  assert.deepEqual(f.world.snapshot(spectator).recon, { reports: [] });
});

test('HTTP exteriorPose uses authoritative reach checks and rejected motion returns a correction snapshot', async () => {
  let now = Date.now();
  const running = startWarServer({ port: 0, dbPath: ':memory:', now: () => now });
  await new Promise(resolve => running.server.once('listening', resolve));
  const base = `http://127.0.0.1:${running.server.address().port}`;
  let token = '';
  const post = async (path, body = {}) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
  try {
    const identity = await post('/identity'); token = identity.token; await post('/poll');
    let sequence = 0;
    const cmd = (type, payload = {}, extra = {}) => post('/command', { id: randomUUID(), sequence: ++sequence, type, payload, ...extra });
    assert.equal((await cmd('create', { faction: 'allies' })).ok, true);
    const p = running.world.state.players[identity.playerId], m = running.world.state.mamutes[p.mamuteId];
    const [id] = [...running.world.theatre.territory].find(([, n]) => n.owner === 'ally' && n.structures.includes('depot'));
    const node = running.world.theatre.logistics.getNode(id); Object.assign(m.robot, { x: node.x, y: node.y });
    const exit = await cmd('exit-base', {}, { pose: { x: 0, z: 3.4, yaw: 0, pitch: 0 } });
    assert.equal(exit.ok, true); assert.equal(exit.snapshot.baseService.outside, true);
    now += 1000; running.world.advance();
    const moved = await post('/poll', { exteriorPose: { x: -4, z: 8, yaw: 0, pitch: 0 } });
    assert.equal(moved.baseService.pose.x, -4);
    const invalid = await post('/poll', { exteriorPose: { x: -99, z: 8, yaw: 0, pitch: 0 } });
    assert.equal(invalid.ok, true); assert.equal(invalid.baseService.pose.x, -4);
    const forged = await cmd('claim', { station: 'aim' }, { pose: { x: 0, z: 0, yaw: 0, pitch: 0 } });
    assert.equal(forged.reason, 'operator-outside');
  } finally { await running.close(); }
});
