import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function network() {
  const nodes = [
    createLogisticsNode({ id: 'HQ', team: 'ally', stock: { materials: 100 } }),
    createLogisticsNode({ id: 'MID', team: 'ally' }),
    createLogisticsNode({ id: 'FRONT', team: 'ally' }),
  ];
  const routes = [
    createSupplyRoute({ id: 'R1', team: 'ally', from: 'HQ', to: 'MID', distance: 100 }),
    createSupplyRoute({ id: 'R2', team: 'ally', from: 'MID', to: 'FRONT', distance: 100 }),
  ];
  return createStrategicLogistics({ nodes, routes });
}

test('convoy reports one blocked transition and one resumed transition', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 50 }, speed: 10 });

  logistics.step(5);
  logistics.setRouteOpen('R1', false);
  const blocked = logistics.step(1);
  assert.deepEqual(blocked, [{
    type: 'convoy-blocked',
    convoyId,
    team: 'ally',
    to: 'FRONT',
    kind: 'supply',
    routeId: 'R1',
    fromNode: 'HQ',
    toNode: 'MID',
  }]);
  assert.deepEqual(logistics.step(1), []);

  logistics.setRouteOpen('R1', true);
  const resumed = logistics.step(1);
  assert.equal(resumed[0]?.type, 'convoy-resumed');
  assert.equal(resumed[0]?.convoyId, convoyId);
  assert.equal(resumed[0]?.routeId, 'R1');
  assert.equal(logistics.snapshot().convoys.find(item => item.id === convoyId)?.status, 'moving');
});

test('captured next node reports the exact blocked leg without duplicating events', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'HQ', to: 'FRONT', cargo: { materials: 50 }, speed: 10 });

  logistics.step(9);
  logistics.getNode('MID').team = 'enemy';
  const blocked = logistics.step(2);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.type, 'convoy-blocked');
  assert.equal(blocked[0]?.convoyId, convoyId);
  assert.equal(blocked[0]?.routeId, 'R1');
  assert.equal(blocked[0]?.fromNode, 'HQ');
  assert.equal(blocked[0]?.toNode, 'MID');
  assert.deepEqual(logistics.step(2), []);
  assert.equal(logistics.getNode('FRONT').stock.materials, 0);
});
