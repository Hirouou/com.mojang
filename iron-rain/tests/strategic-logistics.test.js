import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function network() {
  const nodes = [
    createLogisticsNode({ id: 'HQ', team: 'ally', stock: { materials: 300, ammo: 200, fuel: 100 }, assets: { trucks: 4, tanks: 2, troops: 80 } }),
    createLogisticsNode({ id: 'MID', team: 'ally' }),
    createLogisticsNode({ id: 'FRONT', team: 'ally' }),
  ];
  const routes = [
    createSupplyRoute({ id: 'R1', team: 'ally', from: 'HQ', to: 'MID', distance: 100 }),
    createSupplyRoute({ id: 'R2', team: 'ally', from: 'MID', to: 'FRONT', distance: 100 }),
  ];
  return createStrategicLogistics({ nodes, routes });
}

test('materials leave the rear node when a physical convoy is dispatched', () => {
  const logistics = network();
  const result = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 100, ammo: 20 }, speed: 10 });
  assert.equal(result.ok, true);
  assert.equal(logistics.getNode('HQ').stock.materials, 200);
  assert.equal(logistics.getNode('FRONT').stock.materials, 0);
  logistics.step(20);
  assert.equal(logistics.getNode('FRONT').stock.materials, 100);
  assert.equal(logistics.getNode('FRONT').stock.ammo, 20);
});

test('cut route stops a convoy before resources reach the front', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 100 }, speed: 10 });
  logistics.step(8);
  logistics.setRouteOpen('R2', false);
  logistics.step(20);
  const convoy = logistics.snapshot().convoys.find(item => item.id === convoyId);
  assert.equal(convoy.status, 'blocked');
  assert.equal(logistics.getNode('FRONT').stock.materials, 0);
});

test('captured intermediate sector immediately invalidates stale friendly routing', () => {
  const logistics = network();
  logistics.getNode('MID').team = 'enemy';

  assert.equal(logistics.route('ally', 'HQ', 'FRONT'), null);
  const result = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 40 } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'route-cut');
  assert.equal(logistics.getNode('HQ').stock.materials, 300);
});

test('convoy already in transit blocks when a path endpoint changes faction', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 100 }, speed: 10 });
  logistics.step(5);
  logistics.getNode('MID').team = 'enemy';
  logistics.step(30);

  const convoy = logistics.snapshot().convoys.find(item => item.id === convoyId);
  assert.equal(convoy.status, 'blocked');
  assert.equal(logistics.getNode('FRONT').stock.materials, 0);
});

test('destroyed convoy loses its cargo instead of teleporting stock to destination', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { ammo: 100 }, speed: 10 });
  const events = logistics.step(1, { damageByConvoy: { [convoyId]: 150 } });
  assert.equal(events[0]?.type, 'convoy-destroyed');
  assert.equal(logistics.getNode('FRONT').stock.ammo, 0);
});

test('tanks and troops physically leave rear inventory and only appear at the front after travel', () => {
  const logistics = network();
  const result = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', assets: { tanks: 1, troops: 24 }, kind: 'reinforcement', speed: 10 });
  assert.equal(result.ok, true);
  assert.equal(logistics.getNode('HQ').assets.tanks, 1);
  assert.equal(logistics.getNode('HQ').assets.troops, 56);
  assert.equal(logistics.getNode('FRONT').assets.tanks, 0);
  assert.equal(logistics.getNode('FRONT').assets.troops, 0);
  logistics.step(19);
  assert.equal(logistics.getNode('FRONT').assets.tanks, 0);
  logistics.step(1);
  assert.equal(logistics.getNode('FRONT').assets.tanks, 1);
  assert.equal(logistics.getNode('FRONT').assets.troops, 24);
});

test('destroyed reinforcement convoy permanently loses transported vehicles and soldiers', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', assets: { trucks: 1, tanks: 1, troops: 18 }, kind: 'reinforcement', speed: 10 });
  const events = logistics.step(1, { damageByConvoy: { [convoyId]: 150 } });
  assert.equal(events[0]?.type, 'convoy-destroyed');
  assert.equal(events[0]?.lostAssets.tanks, 1);
  assert.equal(events[0]?.lostAssets.trucks, 1);
  assert.equal(events[0]?.lostAssets.troops, 18);
  assert.equal(logistics.getNode('FRONT').assets.tanks, 0);
  assert.equal(logistics.getNode('FRONT').assets.trucks, 0);
  assert.equal(logistics.getNode('FRONT').assets.troops, 0);
});

test('dispatch refuses vehicles or troops that do not exist at the origin', () => {
  const logistics = network();
  const result = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', assets: { tanks: 3 } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'origin-assets-insufficient');
});
