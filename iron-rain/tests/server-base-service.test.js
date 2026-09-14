import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseService } from '../server/base-service.mjs';

function fixture(ammo = 12) {
  const m = { id: 'M74', faction: 'allies', robot: { x: 10000, y: 10000, facing: 0, speed: 0, armor: 100 },
    engine: { fire: 0 }, stations: {}, ammo: { HE: 0, SMOKE: 0, FRAG: 0 } };
  const state = { time: 0, wallMs: 1000, players: {}, mamutes: { [m.id]: m } }, online = new Map(), events = [];
  const source = { id: 'base', team: 'ally', alive: true, x: 10000, y: 10000, stock: { ammo } };
  const territory = new Map([['base', { owner: 'ally', contested: false, structures: ['outpost', 'depot'] }]]);
  const theatre = { territory, records: new Map([['base', { hex: { name: 'REGION' }, sector: { name: 'BASE' } }]]), logistics: { getNode: id => id === 'base' ? source : null } };
  const service = createBaseService({ state, theatre, online, event: (...args) => events.push(args), release: player => {
    for (const [key, owner] of Object.entries(m.stations)) if (owner === player.id) delete m.stations[key];
  } });
  const player = id => {
    const p = { id, faction: 'allies', mamuteId: m.id };
    state.players[id] = p; online.set(id, { at: state.wallMs, pose: { x: 0, z: 3.4, yaw: 0, pitch: 0 } }); return p;
  };
  const advance = seconds => { state.time += seconds; state.wallMs += seconds * 1000; for (const p of online.values()) p.at = state.wallMs; };
  const walk = (p, x, z) => {
    while (Math.hypot(p.exterior.x - x, p.exterior.z - z) > .001) {
      const d = Math.hypot(x - p.exterior.x, z - p.exterior.z), length = Math.min(d, 4);
      const point = { x: p.exterior.x + (x - p.exterior.x) * length / d, z: p.exterior.z + (z - p.exterior.z) * length / d, yaw: 0, pitch: 0 };
      advance(1); assert.equal(service.heartbeat(p, point).ok, true);
    }
  };
  const rack = p => { walk(p, -12, 8); walk(p, -12, 0); };
  const rear = p => { walk(p, -12, 8); walk(p, 0, 8); };
  return { state, m, online, source, territory, service, events, player, advance, walk, rack, rear };
}

test('exit requires rear hatch, parked live vehicle and an operational friendly base', () => {
  const f = fixture(), p = f.player('p');
  f.m.robot.speed = 1; assert.equal(f.service.command(p, 'exit-base').reason, 'park-mamute-first');
  f.m.robot.speed = 0; f.m.engine.fire = 1;
  assert.equal(f.service.command(p, 'exit-base').reason, 'extinguish-mamute-first');
  f.m.engine.fire = 0; f.online.get(p.id).pose.z = 0;
  assert.equal(f.service.command(p, 'exit-base').reason, 'rear-hatch-out-of-reach');
  f.online.get(p.id).pose.z = 3.4; f.territory.get('base').owner = 'enemy';
  assert.equal(f.service.command(p, 'exit-base').reason, 'friendly-base-required');
  f.territory.get('base').owner = 'ally'; f.m.robot.x += 501;
  assert.equal(f.service.command(p, 'exit-base').reason, 'friendly-base-required');
  f.m.robot.x -= 501; f.m.stations.drive = p.id;
  assert.equal(f.service.command(p, 'exit-base').ok, true);
  assert.deepEqual([p.exterior.x, p.exterior.z], [0, 8]);
  assert.equal(f.m.stations.drive, undefined); assert.equal(f.m.hatchOpen, true);
});

test('three carriers debit finite base stock once each and visibly exhaust it', () => {
  const f = fixture(7), players = ['a', 'b', 'c'].map(f.player);
  for (const p of players) { assert.equal(f.service.command(p, 'exit-base').ok, true); f.rack(p); }
  for (const p of players) assert.equal(f.service.command(p, 'pickup-ammo', { shell: 'HE' }).ok, true);
  assert.deepEqual(players.map(p => p.exterior.carry.amount), [3, 3, 1]); assert.equal(f.source.stock.ammo, 0);
  assert.equal(f.service.command(players[0], 'pickup-ammo').reason, 'already-carrying');
  for (const p of players) { f.rear(p); assert.equal(f.service.command(p, 'deposit-ammo').ok, true); }
  assert.equal(f.m.ammo.HE, 7); assert.equal(f.source.stock.ammo, 0);
  f.rack(players[0]); assert.equal(f.service.command(players[0], 'pickup-ammo').reason, 'base-ammo-empty');
  assert.equal(f.service.snapshot(players[0]).base.ammo, 0);
});

test('loading range and capacity retain excess cargo; return and entry do not conjure ammunition', () => {
  const f = fixture(5), p = f.player('p');
  f.service.command(p, 'exit-base');
  assert.equal(f.service.command(p, 'pickup-ammo').reason, 'ammo-rack-out-of-reach');
  f.rack(p); f.service.command(p, 'pickup-ammo', { shell: 'SMOKE' });
  assert.equal(f.service.command(p, 'deposit-ammo').reason, 'mamute-loading-out-of-reach');
  f.rear(p); assert.equal(f.service.command(p, 'enter-mamute').reason, 'deposit-or-return-ammo-first');
  f.m.ammo.SMOKE = 7; f.m.robot.speed = 1;
  assert.equal(f.service.command(p, 'deposit-ammo').reason, 'park-mamute-first');
  f.m.robot.speed = 0;
  assert.equal(f.service.command(p, 'deposit-ammo').amount, 1); assert.equal(f.m.ammo.SMOKE, 8);
  assert.equal(p.exterior.carry.amount, 2);
  assert.equal(f.service.command(p, 'deposit-ammo').reason, 'ammo-full');
  f.rack(p); assert.equal(f.service.command(p, 'return-ammo').ok, true); assert.equal(f.source.stock.ammo, 4);
  assert.equal(f.service.command(p, 'return-ammo').reason, 'no-ammo-box');
  f.rear(p); assert.equal(f.service.command(p, 'enter-mamute').ok, true);
  assert.equal(p.exterior, null); assert.equal(f.online.get(p.id).pose.z, 3.4);
});

test('exterior movement rejects teleporting, leaving the base, collision and packet-spam speedup', () => {
  const f = fixture(), p = f.player('p'); f.service.command(p, 'exit-base');
  assert.equal(f.service.heartbeat(p, { x: -12, z: 0, yaw: 0, pitch: 0 }).reason, 'exterior-movement-too-fast');
  assert.equal(f.service.heartbeat(p, { x: 25, z: 8, yaw: 0, pitch: 0 }).reason, 'base-boundary');
  f.advance(1);
  assert.equal(f.service.heartbeat(p, { x: 0, z: 4, yaw: 0, pitch: 0 }).reason, 'mamute-collision');
  assert.equal(f.service.heartbeat(p, { x: 5, z: 8, yaw: 0, pitch: 0 }).ok, true);
  assert.equal(f.service.heartbeat(p, { x: 5.25, z: 8, yaw: 0, pitch: 0 }).ok, true);
  assert.equal(f.service.heartbeat(p, { x: 5.5, z: 8, yaw: 0, pitch: 0 }).reason, 'exterior-movement-too-fast');
  assert.equal(f.service.heartbeat(p, { x: NaN, z: 8, yaw: 0, pitch: 0 }).reason, 'invalid-exterior-pose');
});

test('disconnect/reconnect and service recreation preserve the exact carried box', () => {
  const f = fixture(), p = f.player('p'); f.service.command(p, 'exit-base'); f.rack(p); f.service.command(p, 'pickup-ammo');
  const saved = structuredClone(f.state), restoredPlayer = saved.players.p;
  f.online.delete(p.id);
  assert.equal(f.service.command(p, 'return-ammo').reason, 'presence-required'); assert.equal(f.source.stock.ammo, 9);
  const restored = createBaseService({ state: saved, online: f.online, theatre: {
    territory: f.territory, records: new Map(), logistics: { getNode: () => f.source } } });
  f.online.set(p.id, { at: saved.wallMs });
  assert.equal(restored.snapshot(restoredPlayer).carry.amount, 3);
  assert.equal(restored.command(restoredPlayer, 'pickup-ammo').reason, 'already-carrying');
  assert.equal(restored.reset(restoredPlayer).ok, true); assert.equal(f.source.stock.ammo, 12);
  assert.equal(restored.reset(restoredPlayer).ok, true); assert.equal(f.source.stock.ammo, 12);
});

test('capture invalidates base service immediately and unregistered player objects are rejected', () => {
  const f = fixture(), p = f.player('p'); f.service.command(p, 'exit-base'); f.rack(p);
  assert.equal(f.service.command({ ...p }, 'pickup-ammo').reason, 'presence-required');
  f.source.team = 'enemy';
  assert.equal(f.service.command(p, 'pickup-ammo').reason, 'base-no-longer-friendly'); assert.equal(f.source.stock.ammo, 12);
  f.rear(p);
  assert.equal(f.service.command(p, 'enter-mamute').ok, true, 'capture does not trap an operator outside');
});
