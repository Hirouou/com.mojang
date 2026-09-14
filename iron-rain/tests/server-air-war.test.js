import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerAirWar, SERVER_AIR_LIMITS } from '../server/air-war.mjs';
import { initializeSector } from '../modules/war-simulation-core.js';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createStrategicLogistics } from '../modules/strategic-logistics.js';

function fixture({ stock = 300 } = {}) {
  const records = new Map(), territory = new Map(), nodes = [];
  for (const team of ['ally', 'enemy']) {
    const point = { id: `${team}-field`, x: team === 'ally' ? 39000 : 41000, y: 30000, owner: team };
    const node = createTerritoryNode({ id: point.id, owner: team }); node.contested = false; node.structures = ['outpost', 'garage'];
    records.set(point.id, { sector: point }); territory.set(point.id, node);
    nodes.push(createLogisticsNode({ ...point, team, stock: { materials: stock, ammo: stock, fuel: stock } }));
  }
  const theatre = { records, territory, logistics: createStrategicLogistics({ nodes }) };
  const battlefield = { sectors: [initializeSector({ id: 0, strategicSectorId: 'objective', x: 40000, y: 30000, assets: [], allyStrength: 68, enemyStrength: 68 })], warSimulation: { support: [] } };
  let runtime = createServerAirWar({ battlefield, theatre });
  const step = seconds => { for (let i = 0; i < seconds * 10; i++) runtime.step(.1); };
  const bomber = (team = 'enemy') => { const item = { id: `bomber-${team}`, team, type: 'bomber', x: 40500, y: 30000, z: 600, target: { x: 40000, y: 30000 }, origin: { x: 38000, y: 30000 }, life: 12, dropped: 0 }; battlefield.warSimulation.support.push(item); return item; };
  return { battlefield, theatre, step, bomber, get runtime() { return runtime; }, restart() { runtime = createServerAirWar({ battlefield, theatre }); } };
}

test('bomber sorties debit real stock once and retain their receipt across restart', () => {
  const f = fixture(); const bomber = f.bomber();
  const stock = f.theatre.logistics.getNode('enemy-field').stock;
  f.runtime.step(.1);
  assert.equal(stock.fuel, 282); assert.equal(stock.ammo, 290);
  assert.equal(bomber.airWarFunded, true);
  const checkpoint = structuredClone(f.battlefield);
  Object.assign(f.battlefield, checkpoint); f.restart(); f.runtime.step(.1);
  assert.equal(stock.fuel, 282); assert.equal(stock.ammo, 290);
});

test('an unfunded core bomber is removed before it can drop bombs', () => {
  const f = fixture({ stock: 0 }); const bomber = f.bomber(); f.runtime.step(.1);
  assert.equal(bomber.alive, false);
  assert.equal(f.battlefield.warSimulation.support.length, 0);
  assert.equal(bomber.dropped, 0);
});

test('AA is paid for at its territorial location and shoots hostile aircraft using finite magazines', () => {
  const f = fixture(); f.step(1.1);
  const batteries = f.battlefield.sectors[0].assets.filter(asset => asset.type === 'AA');
  assert.equal(batteries.length, 2);
  const own = batteries.find(item => item.team === 'ally');
  assert.equal(own.x, f.theatre.records.get('ally-field').sector.x);
  assert.equal(f.theatre.logistics.getNode('ally-field').stock.materials, 225);
  const hostile = f.bomber('enemy'), friendly = f.bomber('ally');
  batteries.find(item => item.team === 'enemy').ammo = 0;
  f.step(7);
  assert.equal(hostile.alive, false);
  assert.equal(friendly.hp, 90);
  assert.ok(own.ammo < 18);
  assert.ok(f.runtime.snapshot({ team: 'ally' }).reports.some(item => item.type === 'aircraft-downed'));
  const spent = f.theatre.logistics.getNode('ally-field').stock.materials;
  f.restart(); f.step(10);
  assert.equal(f.theatre.logistics.getNode('ally-field').stock.materials, spent);
});

test('fighters launch from funded source positions and fly continuously instead of appearing over targets', () => {
  const f = fixture(); f.battlefield.airWar.nextDefenseAt = 10000;
  f.step(2.1);
  const plane = f.battlefield.airWar.aircraft[0];
  assert.equal(plane.type, 'fighter'); assert.equal(plane.originId, 'ally-field');
  assert.ok(plane.x > plane.origin.x && plane.x < plane.target.x);
  const x = plane.x; f.step(.5);
  assert.ok(plane.x > x); assert.ok(plane.x - x <= 460 * .5 + .01);
  assert.equal(f.theatre.logistics.getNode('ally-field').stock.fuel, 288);
});

test('fighters engage only acquired hostile aircraft and generate actual damage', () => {
  const f = fixture(); f.battlefield.airWar.nextDefenseAt = 10000; f.step(2.1);
  const plane = f.battlefield.airWar.aircraft[0], bomber = f.bomber('enemy');
  bomber.x = plane.x + 200; bomber.y = plane.y;
  f.step(.2);
  assert.ok(bomber.hp < 90); assert.equal(plane.ammo, 15);
  assert.ok(f.runtime.snapshot({ team: 'ally' }).reports.some(entry => entry.type === 'dogfight'));
});

test('recon reports only overflown ground and enemy aircraft stay hidden beyond observer range', () => {
  const f = fixture(); f.battlefield.airWar.nextDefenseAt = 10000;
  f.battlefield.airWar.sortie = 2; f.step(2.1);
  const recon = f.battlefield.airWar.aircraft[0]; assert.equal(recon.type, 'recon');
  const far = f.bomber('enemy'); far.x = 70000;
  f.runtime.step(.1);
  const seen = f.runtime.snapshot({ team: 'ally', position: { x: 5000, y: 5000 } });
  assert.equal(seen.aircraft.some(plane => plane.id === far.id), false);
  const report = seen.reports.find(entry => entry.type === 'recon-contact');
  assert.ok(report); assert.ok(report.observations.every(item => Math.hypot(item.x - report.x, item.y - report.y) <= SERVER_AIR_LIMITS.reconSight));
  assert.deepEqual(f.runtime.snapshot({ team: null }).reports, []);
});

test('air checkpoints are plain bounded data and zero stocks create no aircraft or AA', () => {
  const f = fixture({ stock: 0 }); f.step(180);
  assert.equal(f.battlefield.airWar.aircraft.length, 0);
  assert.equal(f.battlefield.sectors[0].assets.length, 0);
  assert.doesNotThrow(() => structuredClone(f.battlefield));
  assert.ok(f.battlefield.airWar.reports.length <= SERVER_AIR_LIMITS.reports);
  assert.ok(f.battlefield.airWar.effects.length <= SERVER_AIR_LIMITS.effects);
});

test('AA resupply debits its own local stock and cannot use a captured endpoint', () => {
  const f = fixture(); f.step(1.1);
  const battery = f.battlefield.sectors[0].assets.find(asset => asset.type === 'AA' && asset.team === 'ally');
  const endpoint = f.theatre.logistics.getNode(battery.originId);
  f.battlefield.airWar.nextSortieAt = 10000;
  battery.ammo = 0;
  const ammoBefore = endpoint.stock.ammo;
  f.battlefield.airWar.nextDefenseAt = 0; f.runtime.step(.1);
  assert.equal(battery.ammo, 12); assert.equal(endpoint.stock.ammo, ammoBefore - 12);
  battery.ammo = 0; endpoint.team = 'enemy';
  f.battlefield.airWar.nextDefenseAt = 0; f.runtime.step(.1);
  assert.equal(battery.ammo, 0); assert.equal(endpoint.stock.ammo, ammoBefore - 12);
});
