import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_ROAD_RULES,
  buildCapitalLayout,
  buildStrategicRoadGeometry,
  capitalPlacementAllowed,
  capitalRoadSpeedMultiplier,
  distanceToCapitalRoad,
  roadTravelSpeed,
  sampleRoadGeometry,
} from '../modules/capital-city-layout.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { clearRoadMobilityCache, localCapitalScene, mamuteTravelSpeed, roadSpeedMultiplier } from '../modules/road-mobility.js';

test('capital road network is deterministic, organic and junction-aware', () => {
  const input = { id: 'ALPHA', x: 5000, y: 4200, roadBearings: [0, Math.PI * .62, Math.PI * 1.08], structures: ['depot', 'garage'], density: 18 };
  const first = buildCapitalLayout(input);
  const second = buildCapitalLayout(input);
  const other = buildCapitalLayout({ ...input, id: 'BRAVO' });

  assert.deepEqual(second, first);
  assert.notDeepEqual(other.roads, first.roads);
  assert.ok(first.roads[0].points.length > 10);
  assert.ok(first.junctions.length >= 1);
  assert.ok(['t', 'y', 'cross'].includes(first.junctions[0].kind));
  assert.ok(first.roads.slice(1).some(road => road.capEnd === false), 'branches merge into the junction without a visible inner cap');

  const primary = first.roads[0];
  const a = primary.points[0], b = primary.points.at(-1);
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  assert.ok(distanceToCapitalRoad(first, straightMid) > 1, 'primary geometry should not collapse into a perfect straight runway');
});

test('all generated facilities respect full-footprint road clearance', () => {
  const layout = buildCapitalLayout({
    id: 'CLEARANCE', x: 1200, y: 900,
    roadBearings: [0, Math.PI * .55, Math.PI * 1.2, Math.PI * 1.65],
    structures: ['outpost', 'depot', 'garage', 'factory', 'bunker', 'mortar'],
    density: 30,
  });

  for (const item of [...layout.structures, ...layout.civilian]) {
    const clearance = Math.hypot(item.width, item.height) * .5;
    assert.equal(capitalPlacementAllowed(layout, { x: item.x, y: item.y, clearance }), true, `${item.id} footprint overlaps no-build corridor`);
  }

  const roadPoint = layout.roads[0].points[Math.floor(layout.roads[0].points.length / 2)];
  assert.equal(capitalPlacementAllowed(layout, { ...roadPoint, clearance: 0 }), false);
});

test('road multiplier changes translation speed only and preserves exact off-road base', () => {
  const layout = buildCapitalLayout({ id: 'SPEED', x: 0, y: 0, roadBearings: [0, Math.PI] });
  const onRoad = layout.roads[0].points[4];
  const offRoad = { x: layout.center.x + layout.radius * .9, y: layout.center.y + layout.radius * .9 };

  assert.equal(capitalRoadSpeedMultiplier(layout, offRoad), 1);
  assert.ok(capitalRoadSpeedMultiplier(layout, onRoad) > 1);
  assert.equal(roadTravelSpeed(38, 1), 38);
  assert.ok(Math.abs(roadTravelSpeed(38 * .2, 1) - 7.6) < 1e-9);
  assert.ok(Math.abs(roadTravelSpeed(38, CAPITAL_ROAD_RULES.roadSpeedMultiplier) - 55.1) < 1e-9);
});

test('strategic route geometry is deterministic, curved and sampleable', () => {
  const route = { id: 'R-AB', from: { id: 'A', x: 0, y: 0 }, to: { id: 'B', x: 8000, y: 1200 } };
  const first = buildStrategicRoadGeometry(route);
  const second = buildStrategicRoadGeometry(route);
  assert.deepEqual(second, first);
  assert.ok(first.points.length > 10);
  assert.ok(first.length > Math.hypot(8000, 1200));
  const middle = sampleRoadGeometry(first, .5, { laneOffset: 4, laneDirection: 'forward' });
  assert.ok(Number.isFinite(middle.x) && Number.isFinite(middle.y) && Number.isFinite(middle.heading));
});

test('convoy render position follows route polyline without changing logical travel distance', () => {
  const nodes = [
    createLogisticsNode({ id: 'A', team: 'ally', x: 0, y: 0, stock: { materials: 10 } }),
    createLogisticsNode({ id: 'B', team: 'ally', x: 6000, y: 1000 }),
  ];
  const route = createSupplyRoute({ id: 'AB', team: 'ally', from: 'A', to: 'B', distance: 6000, laneOffset: 4 });
  const logistics = createStrategicLogistics({ nodes, routes: [route] });
  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'B', cargo: { materials: 1 }, speed: 100 });
  assert.equal(dispatch.ok, true);
  logistics.step(15);
  const snapshot = logistics.snapshot();
  const convoy = snapshot.convoys[0];

  assert.equal(convoy.legProgress, 1500);
  assert.ok(snapshot.routes[0].geometry.points.length > 2);
  const straightQuarter = { x: 1500, y: 250 };
  assert.ok(Math.hypot(convoy.position.x - straightQuarter.x, convoy.position.y - straightQuarter.y) > 1, 'render position should follow curved geometry rather than endpoint lerp');
});

test('Mamute mobility adapter uses strategic bearings and keeps off-road speed unchanged', () => {
  const nodes = [
    createLogisticsNode({ id: 'CAP', team: 'ally', x: 0, y: 0 }),
    createLogisticsNode({ id: 'EAST', team: 'ally', x: 7000, y: 0 }),
    createLogisticsNode({ id: 'NORTH', team: 'ally', x: 0, y: -7000 }),
  ];
  const logistics = createStrategicLogistics({ nodes, routes: [
    createSupplyRoute({ id: 'CE', team: 'ally', from: 'CAP', to: 'EAST', distance: 7000 }),
    createSupplyRoute({ id: 'CN', team: 'ally', from: 'CAP', to: 'NORTH', distance: 7000 }),
  ] });
  const strategic = {
    locate: () => ({ sector: { id: 'CAP', x: 0, y: 0, structures: [] } }),
    combatReserveContext: (id, team) => id === 'CAP' && team === 'ally' ? { strategicLogistics: logistics, territory: { structures: [] } } : null,
  };

  clearRoadMobilityCache();
  const scene = localCapitalScene({ x: 0, y: 0 }, strategic);
  assert.ok(scene);
  assert.equal(scene.layout.roadBearings.length, 2);

  const onRoad = scene.layout.roads[0].points[5];
  const farOffRoad = { x: 10000, y: 10000 };
  assert.ok(roadSpeedMultiplier(onRoad, strategic) > 1);
  assert.equal(roadSpeedMultiplier(farOffRoad, strategic), 1);
  assert.ok(mamuteTravelSpeed(38, onRoad, strategic) > 38);
  assert.equal(mamuteTravelSpeed(38, farOffRoad, strategic), 38);
});
