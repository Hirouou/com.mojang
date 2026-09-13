import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const war = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../modules/battlefield-view.js', import.meta.url), 'utf8');

test('live war projects canonical logistics convoys into bounded local traffic without moving them', () => {
  assert.match(war, /import \{ localConvoyMaterializationFeed \} from '\.\/local-missions\.js'/);
  assert.match(war, /const snapshot = logistics\.snapshot\(\)/);
  assert.match(war, /localConvoyMaterializationFeed\(\{/);
  assert.match(war, /convoys: snapshot\.convoys \|\| \[\]/);
  assert.match(war, /observedEnemyIds/);
  assert.match(war, /localRadius: 9_000/);
  assert.match(war, /x: convoy\.position\.x/);
  assert.match(war, /y: convoy\.position\.y/);
  assert.match(war, /angle: Number\(convoy\.position\.heading\) \|\| 0/);
  assert.doesNotMatch(war, /convoy\.legProgress/);
  assert.match(war, /state\.warSimulation\.strategicTraffic = materialized\.slice\(0, 40\)/);
  assert.match(war, /publishStrategicTraffic\(state\)/);
});

test('nearby local roads reuse canonical logistics nodes and routes without leaking route ownership', () => {
  assert.match(war, /function localStrategicRoads\(snapshot, playerPosition\)/);
  assert.match(war, /snapshot\?\.nodes \|\| \[\]/);
  assert.match(war, /snapshot\?\.routes \|\| \[\]/);
  assert.match(war, /distanceToSegment\(playerPosition, from, to\) > LOCAL_ROAD_RADIUS/);
  assert.match(war, /state\.warSimulation\.strategicRoads = localStrategicRoads\(snapshot, state\.robot\)/);
  assert.match(war, /from: Object\.freeze\(\{ x: from\.x, y: from\.y \}\)/);
  assert.match(war, /to: Object\.freeze\(\{ x: to\.x, y: to\.y \}\)/);
  assert.doesNotMatch(war, /strategicRoads[^\n]*team/);
});

test('nearby canonical capitals reuse logistics node positions and live territory structures for the existing base renderer', () => {
  assert.match(war, /const LOCAL_CAPITAL_RADIUS = 6_500/);
  assert.match(war, /function publishStrategicCapitals\(state, snapshot\)/);
  assert.match(war, /for \(const node of snapshot\?\.nodes \|\| \[\]\)/);
  assert.match(war, /strategicMap\.locate\(node\)/);
  assert.match(war, /Array\.isArray\(sector\.structures\) \? \[\.\.\.sector\.structures\] : \[\]/);
  assert.match(war, /id: `strategic-capital:\$\{node\.id\}`/);
  assert.match(war, /level: capitalVisualLevel\(structures\)/);
  assert.match(war, /__strategicCapitalVisual: true/);
  assert.doesNotMatch(war, /host\.war\.bases\.push\(\.\.\.capitals\)/);
});

test('capital visuals persist between throttled strategic traffic projections instead of flickering per frame', () => {
  const publishStart = war.indexOf('function publishStrategicTraffic(state)');
  const throttle = war.indexOf('if (now < (state.warSimulation.nextTrafficProjection || 0)) return;', publishStart);
  const strip = war.indexOf('stripStrategicCapitalVisuals(state);', publishStart);
  assert.ok(publishStart >= 0 && throttle > publishStart && strip > throttle);

  const updateStart = war.indexOf('export function updateWar(state, dt)');
  const updateEnd = war.indexOf('export function assessRoute', updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.doesNotMatch(war.slice(updateStart, updateEnd), /stripStrategicCapitalVisuals\(state\);/);
});

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
