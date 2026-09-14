import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerFrontline } from '../server/frontline.mjs';
import { initializeSector, updateWar, applyWarImpact, getFrontGeometry } from '../modules/war-simulation-core.js';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function fixture(team = 'ally') {
  const direction = team === 'ally' ? 1 : -1;
  const points = [
    { id: 'objective', x: 40000, y: 30000, owner: 'neutral' },
    { id: 'next-objective', x: 40000 + direction * 1200, y: 30000, owner: 'neutral' },
    { id: 'other-front', x: 40000, y: 42000, owner: 'neutral' },
    { id: 'staging', x: 40000 - direction * 1000, y: 30000, owner: team },
    { id: 'rear', x: 40000 - direction * 2000, y: 30000, owner: team },
  ];
  const territory = new Map(points.map(point => {
    const node = createTerritoryNode({ id: point.id, owner: point.owner, assets: { troops: 8 } });
    node.contested = point.owner === 'neutral';
    if (!node.contested) node.structures = ['outpost', 'depot'];
    return [point.id, node];
  }));
  const theatre = {
    records: new Map(points.map(sector => [sector.id, { sector }])), territory,
    logistics: createStrategicLogistics({
      nodes: points.map(point => createLogisticsNode({ ...point, team: point.owner, kind: point.id === 'rear' ? 'depot' : 'front', stock: { ammo: 120 }, assets: { troops: point.id === 'staging' ? 8 : 0 } })),
      routes: [createSupplyRoute({ id: 'supply', team, from: 'rear', to: 'staging', distance: 1000 })],
    }),
  };
  const sector = initializeSector({ id: 0, strategicId: 'objective', name: 'Front', x: 40000, y: 30000, assets: [], allyStrength: 68, enemyStrength: 68 });
  const battlefield = { time: 0, paused: false, mode: 'server', sectors: [sector], cam: { x: -100000, y: -100000 }, robot: { x: -100000, y: -100000 }, smokes: [], tracers: [], effects: [] };
  let bridge = createServerFrontline({ battlefield, theatre });
  const step = (seconds = 1) => {
    const events = [];
    for (let i = 0; i < seconds * 10; i++) { bridge.beforeTick(); battlefield.time += .1; updateWar(battlefield, .1); events.push(...bridge.afterTick()); }
    return events;
  };
  const push = () => {
    sector[team === 'ally' ? 'allyStrength' : 'enemyStrength'] = 85;
    sector[team === 'ally' ? 'enemyStrength' : 'allyStrength'] = 0;
    Object.assign(sector.war[team], { phase: 'assault', phaseTime: 60, advance: 639, morale: 1, ammo: 1, suppression: 0 });
    sector.war[team === 'ally' ? 'enemy' : 'ally'].reinforcementsIn = 1000;
  };
  return { theatre, battlefield, sector, step, push, get bridge() { return bridge; }, reconnect() { bridge = createServerFrontline({ battlefield, theatre }); } };
}

for (const team of ['ally', 'enemy']) test(`${team} supplied capture changes only strategic sector centers crossed by the held line`, () => {
  const f = fixture(team); f.push();
  const events = f.step();
  assert.equal(f.sector.war.captures, 1);
  assert.equal(f.theatre.records.get('objective').sector.owner, team);
  assert.equal(f.theatre.territory.get('objective').owner, team);
  assert.equal(f.theatre.logistics.getNode('objective').team, team);
  assert.equal(f.theatre.records.get('next-objective').sector.owner, 'neutral');
  assert.equal(f.theatre.records.get('other-front').sector.owner, 'neutral');
  assert.deepEqual(events.map(event => event.sectorId), ['objective']);
});

test('intact defense and progress alone never publish a phantom strategic capture', () => {
  const f = fixture();
  f.sector.progress = 100;
  assert.deepEqual(f.step(30), []);
  assert.equal(f.sector.war.captures, 0);
  assert.equal(f.theatre.records.get('objective').sector.owner, 'neutral');
});

test('a captured checkpoint reconnects without duplicate events or resetting development', () => {
  const f = fixture(); f.push(); f.step();
  const node = f.theatre.territory.get('objective'); node.securedFor = 28;
  const revision = node.controlRevision;
  const checkpoint = structuredClone(f.battlefield);
  f.battlefield.sectors = checkpoint.sectors;
  f.battlefield.warSimulation = checkpoint.warSimulation;
  f.reconnect();
  assert.deepEqual(f.step(), []);
  assert.equal(node.securedFor, 28);
  assert.equal(node.controlRevision, revision);
});

test('migrated reserves debit finite delivered troops and preserve a staging garrison', () => {
  const f = fixture();
  f.sector.war.ally.reinforcementsIn = 0;
  f.sector.allyStrength = 40;
  f.step();
  const endpoint = f.theatre.logistics.getNode('staging');
  assert.equal(f.sector.strategicSectorId, 'objective');
  assert.ok(f.sector.war.ally.reinforcements > 0);
  assert.equal(endpoint.assets.troops + f.sector.war.ally.reinforcements, 8);
  assert.ok(endpoint.assets.troops >= 2);
  endpoint.assets.troops = 2;
  const before = f.sector.war.ally.reinforcements;
  f.sector.war.ally.reinforcementsIn = 0;
  f.step();
  assert.equal(f.sector.war.ally.reinforcements, before);
  assert.equal(endpoint.assets.troops, 2);
});

test('severing the only supply route prevents a nearly completed offensive', () => {
  const f = fixture(); f.push();
  f.theatre.logistics.setRouteOpen('supply', false);
  assert.deepEqual(f.step(), []);
  assert.equal(f.sector.war.captures, 0);
  assert.equal(f.theatre.records.get('objective').sector.owner, 'neutral');
});

test('artillery casualties and suppression change real frontline pressure before capture', () => {
  const f = fixture(); f.bridge.beforeTick();
  const enemy = getFrontGeometry(f.sector).enemyTrench;
  const strength = f.sector.enemyStrength, suppression = f.sector.war.enemy.suppression;
  const result = applyWarImpact(f.battlefield, enemy.x, enemy.y, 'FRAG');
  assert.ok(result.affected.some(entry => entry.team === 'enemy' && entry.loss > 0));
  assert.ok(f.sector.enemyStrength < strength);
  assert.ok(f.sector.war.enemy.suppression > suppression);
  assert.deepEqual(f.bridge.afterTick(), []);
  assert.equal(f.theatre.records.get('objective').sector.owner, 'neutral');
});

test('runtime callbacks never enter checkpoint or client snapshots', () => {
  const f = fixture(); f.bridge.beforeTick();
  assert.equal(typeof f.battlefield.warSimulation.combatReserveContext, 'function');
  assert.equal(Object.getOwnPropertyDescriptor(f.battlefield.warSimulation, 'combatReserveContext').enumerable, false);
  assert.doesNotThrow(() => structuredClone(f.battlefield));
  assert.equal(JSON.stringify(f.battlefield).includes('combatReserveContext'), false);
});
