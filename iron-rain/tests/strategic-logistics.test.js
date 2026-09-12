import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function network() {
  const nodes = [
    createLogisticsNode({ id: 'HQ', team: 'ally', stock: { materials: 300, ammo: 200, fuel: 100 } }),
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

test('destroyed convoy loses its cargo instead of teleporting stock to destination', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { ammo: 100 }, speed: 10 });
  const events = logistics.step(1, { damageByConvoy: { [convoyId]: 150 } });
  assert.equal(events[0]?.type, 'convoy-destroyed');
  assert.equal(logistics.getNode('FRONT').stock.ammo, 0);
});
