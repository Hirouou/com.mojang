import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function network() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'A', team: 'ally', x: 0, y: 0, stock: { materials: 20 } }),
      createLogisticsNode({ id: 'B', team: 'ally', x: 100, y: 0 }),
      createLogisticsNode({ id: 'C', team: 'ally', x: 100, y: 100 }),
      createLogisticsNode({ id: 'D', team: 'ally', x: 200, y: 0 }),
    ],
    routes: [
      createSupplyRoute({ id: 'AB', team: 'ally', from: 'A', to: 'B', distance: 100, laneOffset: 4 }),
      createSupplyRoute({ id: 'BC', team: 'ally', from: 'B', to: 'C', distance: 100, laneOffset: 4 }),
      createSupplyRoute({ id: 'BD', team: 'ally', from: 'B', to: 'D', distance: 100, laneOffset: 4 }),
      createSupplyRoute({ id: 'DC', team: 'ally', from: 'D', to: 'C', distance: Math.hypot(100, 100), laneOffset: 4 }),
    ],
  });
}

test('physical truck position is continuous across a right-angle junction and arrival', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'A', to: 'C', cargo: { materials: 10 }, speed: 10 });
  let previous = logistics.snapshot().convoys[0].position;
  let arrivals = 0;
  for (let frame = 0; frame < 2_100; frame++) {
    arrivals += logistics.step(.01).filter(event => event.type === 'convoy-arrived').length;
    const convoy = logistics.snapshot().convoys.find(item => item.id === convoyId);
    const point = convoy.position;
    assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= .12, `truck jumped at frame ${frame}`);
    if (convoy.status !== 'arrived') assert.equal(logistics.getNode('C').stock.materials, 0);
    previous = point;
  }
  assert.deepEqual({ x: previous.x, y: previous.y }, { x: 100, y: 100 });
  assert.equal(arrivals, 1);
  assert.equal(logistics.getNode('C').stock.materials, 10);
});

test('reroute at a junction keeps the same ID and position and blocking keeps that location', () => {
  const logistics = network();
  const { convoyId } = logistics.dispatch({ team: 'ally', from: 'A', to: 'C', cargo: { materials: 10 }, speed: 10 });
  logistics.step(10);
  const junction = logistics.snapshot().convoys[0].position;
  assert.deepEqual({ x: junction.x, y: junction.y }, { x: 100, y: 0 });
  logistics.setRouteOpen('BC', false);
  const events = logistics.step(0);
  assert.equal(events[0]?.type, 'convoy-rerouted');
  const rerouted = logistics.snapshot().convoys[0];
  assert.equal(rerouted.id, convoyId);
  assert.deepEqual({ x: rerouted.position.x, y: rerouted.position.y }, { x: junction.x, y: junction.y });
  logistics.step(2);
  const inRoad = logistics.snapshot().convoys[0].position;
  logistics.setRouteOpen('BD', false);
  logistics.step(10);
  assert.deepEqual(logistics.snapshot().convoys[0].position, inRoad);
  assert.equal(logistics.getNode('C').stock.materials, 0);
});

test('JSON authority restart preserves moving and blocked trucks, stock and IDs without replay', () => {
  const live = network();
  live.dispatch({ team: 'ally', from: 'A', to: 'C', cargo: { materials: 5 }, speed: 10 });
  live.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { materials: 5 }, speed: 20 });
  live.step(7);
  live.setRouteOpen('BD', false);
  live.reportRouteThreat('BC', { team: 'ally', threat: .8, reportedAt: 7 });
  live.step(1);
  const checkpoint = JSON.parse(JSON.stringify(live.exportState()));
  const restarted = createStrategicLogistics({ restore: checkpoint });
  assert.deepEqual(restarted.snapshot(), live.snapshot());
  assert.equal(restarted.snapshot().convoys[1].status, 'blocked');
  for (let i = 0; i < 160; i++) {
    assert.deepEqual(restarted.step(.1), live.step(.1));
    assert.deepEqual(restarted.snapshot(), live.snapshot());
  }
  const afterArrival = createStrategicLogistics({ restore: JSON.parse(JSON.stringify(restarted.exportState())) });
  const materialBefore = afterArrival.getNode('C').stock.materials;
  afterArrival.step(60);
  assert.equal(afterArrival.getNode('C').stock.materials, materialBefore, 'arrivals must not credit twice on restart');
  const sent = afterArrival.dispatch({ team: 'ally', from: 'A', to: 'C', cargo: { materials: 5 } });
  assert.equal(sent.convoyId, 'CV-3');
  afterArrival.getNode('A').stock.materials = 0;
  assert.notEqual(checkpoint.nodes[0].stock.materials, 0, 'restored runtime must not mutate checkpoint');
});
