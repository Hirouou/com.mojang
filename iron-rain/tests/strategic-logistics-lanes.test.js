import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function road() {
  const nodes = [
    createLogisticsNode({ id: 'A', team: 'ally', x: 0, y: 0, stock: { materials: 20 } }),
    createLogisticsNode({ id: 'B', team: 'ally', x: 100, y: 0, stock: { materials: 20 } }),
  ];
  const routes = [createSupplyRoute({ id: 'R', team: 'ally', from: 'A', to: 'B', distance: 100, laneOffset: 4 })];
  return createStrategicLogistics({ nodes, routes });
}

test('opposite convoy directions keep distinct logical lanes and physical positions', () => {
  const logistics = road();
  const outbound = logistics.dispatch({ team: 'ally', from: 'A', to: 'B', cargo: { materials: 5 }, speed: 10 });
  const returning = logistics.dispatch({ team: 'ally', from: 'B', to: 'A', cargo: { materials: 5 }, speed: 10 });

  logistics.step(2);
  const snapshot = logistics.snapshot();
  const a = snapshot.convoys.find(convoy => convoy.id === outbound.convoyId);
  const b = snapshot.convoys.find(convoy => convoy.id === returning.convoyId);

  assert.equal(a.path[0].laneDirection, 'forward');
  assert.equal(b.path[0].laneDirection, 'return');
  assert.equal(a.position.laneOffset, 4);
  assert.equal(b.position.laneOffset, 4);
  assert.equal(a.position.y, 4);
  assert.equal(b.position.y, -4);
  assert.equal(a.position.x, 20);
  assert.equal(b.position.x, 80);
  assert.equal(a.position.heading, 0);
  assert.equal(Math.abs(b.position.heading), Math.PI);
});

test('lane metadata does not change physical travel time or arrival-only delivery', () => {
  const logistics = road();
  logistics.dispatch({ team: 'ally', from: 'A', to: 'B', cargo: { materials: 10 }, speed: 10 });

  logistics.step(9);
  assert.equal(logistics.getNode('B').stock.materials, 20);
  logistics.step(1);
  assert.equal(logistics.getNode('B').stock.materials, 30);
});
