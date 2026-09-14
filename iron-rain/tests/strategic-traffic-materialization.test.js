import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { updateWar } from '../modules/war-simulation.js';
import { createStrategicHexMap } from '../modules/strategic-hex-map.js';

const war = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../modules/battlefield-view.js', import.meta.url), 'utf8');

const hexes = createStrategicHexMap();
function fixture() {
  const robot = { x: hexes[0].x, y: hexes[0].y };
  return { robot, cam: { ...robot }, sectors: [], time: 10, serverStrategic: { hexes, logistics: { nodes: [], routes: [], convoys: [] } } };
}
function authoritative(run) {
  const before = globalThis.ironRainEntry;
  globalThis.ironRainEntry = { faction: 'allies', runtime: { isAuthoritativeClient: true } };
  try { run(); } finally { globalThis.ironRainEntry = before; delete globalThis.ironRainWarBridge; }
}

test('live war projects the nearest 40 canonical convoys without mutating authority', () => authoritative(() => {
  const state = fixture();
  state.serverStrategic.logistics.convoys = Array.from({ length: 70 }, (_, index) => ({ id: `truck-${index}`, team: 'ally', status: 'moving', speed: 14, position: { x: state.robot.x + 700 - index * 10, y: state.robot.y, heading: .3 } }));
  state.serverStrategic.logistics.convoys.push({ id: 'unobserved', team: 'enemy', status: 'moving', position: { x: state.robot.x + 2000, y: state.robot.y } });
  const before = structuredClone(state.serverStrategic);
  updateWar(state, .016);
  const traffic = state.warSimulation.strategicTraffic;
  assert.equal(traffic.length, 40);
  assert.equal(traffic[0].id, 'truck-69');
  assert.ok(traffic.every(item => item.team === 'ally' && item.angle === .3 && Object.isFrozen(item)));
  assert.deepEqual(state.serverStrategic, before);
}));

test('roads follow the shell camera into a distant hex and preserve world endpoints', () => authoritative(() => {
  const state = fixture(), far = hexes.at(-1);
  state.cam = { x: far.x, y: far.y, mode: 'shell' };
  state.serverStrategic.logistics.nodes = [{ id: 'from', x: far.x, y: far.y }, { id: 'to', x: far.x + 3300, y: far.y }];
  state.serverStrategic.logistics.routes = [{ id: 'road', from: 'from', to: 'to', team: 'enemy', open: true }];
  updateWar(state, .016);
  assert.equal(state.warSimulation.renderInterest.cameraHexId, far.id);
  const road = state.warSimulation.strategicRoads[0];
  assert.deepEqual(road.from, { x: far.x, y: far.y });
  assert.deepEqual(road.to, { x: far.x + 3300, y: far.y });
  assert.equal(road.team, undefined);
}));

test('canonical capitals use actual node position and live structures outside tactical authority', () => authoritative(() => {
  const state = fixture(), sector = hexes[0].sectors[0];
  state.serverStrategic.logistics.nodes = [{ ...sector, team: 'ally', structures: ['depot', 'factory'] }];
  updateWar(state, .016);
  const capital = state.warSimulation.strategicCapitals[0];
  assert.equal(capital.id, `strategic-capital:${sector.id}`);
  assert.equal(capital.x, sector.x); assert.equal(capital.y, sector.y);
  assert.deepEqual(capital.structures, ['depot', 'factory']); assert.equal(capital.level, 4);
  assert.equal(state.sectors.length, 0); assert.ok(Object.isFrozen(capital));
}));

test('capital visuals persist between render ticks even when server time is unchanged', () => authoritative(() => {
  const state = fixture(); state.serverStrategic.logistics.nodes = [{ ...hexes[0].sectors[0], team: 'ally', structures: ['depot'] }];
  updateWar(state, .016); const capitals = state.warSimulation.strategicCapitals;
  for (let i = 0; i < 6; i++) { updateWar(state, .016); assert.equal(state.warSimulation.strategicCapitals, capitals); }
  assert.equal(capitals.length, 1); assert.equal(state.time, 10);
}));

test('hostile convoy materialization is earned locally or by active intel target', () => {
  assert.match(war, /function convoyObservedLocally\(state, convoy\)/);
  assert.match(war, /<= 950/);
  assert.match(war, /const target = state\.intel\?\.target/);
  assert.match(war, /target\.id && target\.id === convoy\.id/);
  assert.match(war, /<= 850/);
  assert.match(war, /convoy\?\.team !== own && convoyObservedLocally\(state, convoy\)/);
});

test('local battlefield draws canonical roads before strategic traffic', () => {
  assert.match(view, /function drawStrategicRoad\(ctx, road, frame\)/);
  assert.match(view, /state\.warSimulation\?\.strategicRoads/);
  assert.match(view, /for \(const road of .*strategicRoads.*\) drawStrategicRoad\(ctx, road, frame\);/);
  assert.ok(view.indexOf('strategicRoads || []') < view.indexOf('strategicTraffic || []'));
  assert.match(view, /road\.open === false/);
});

test('local battlefield renders strategic armor as tanks and supply or troop traffic as trucks', () => {
  assert.match(view, /function drawTruck\(ctx, truck, frame\)/);
  assert.match(view, /state\.warSimulation\?\.strategicTraffic/);
  assert.match(view, /traffic\.kind === 'armor'/);
  assert.match(view, /drawTank\(ctx, \{ \.\.\.traffic, type: 'tank' \}, frame\)/);
  assert.match(view, /else drawTruck\(ctx, traffic, frame\)/);
  assert.match(view, /truck\.kind === 'troops'/);
});

test('finite tactical tanks and reinforcements still consume strategic assets after sustainment integration', () => {
  assert.match(war, /function strategicAssetSnapshot\(state\)/);
  assert.match(war, /function reconcileStrategicAssets\(state, before\)/);
  assert.match(war, /claimAsset\?\.\('troops', accepted\)/);
  assert.match(war, /claimAsset\?\.\('tanks', 1\)/);
  assert.match(war, /syncCombatSustainment\(state\)/);
  assert.match(war, /reconcileStrategicAssets\(state, strategicBefore\)/);
});
