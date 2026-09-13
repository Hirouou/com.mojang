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
  assert.match(war, /\.\.\.localStrategicRoads\(snapshot, state\.robot\)/);
  assert.match(war, /from: Object\.freeze\(\{ x: from\.x, y: from\.y \}\)/);
  assert.match(war, /to: Object\.freeze\(\{ x: to\.x, y: to\.y \}\)/);
  assert.doesNotMatch(war, /strategicRoads[^\n]*team/);
});

test('nearby canonical capitals reuse live territory structures and the existing deterministic city layout', () => {
  assert.match(war, /import \{ buildCapitalLayout \} from '\.\/capital-city-layout\.js'/);
  assert.match(war, /const LOCAL_CAPITAL_RADIUS = 6_500/);
  assert.match(war, /function capitalLayoutForNode\(snapshot, node, structures\)/);
  assert.match(war, /roadBearings\.push\(Math\.atan2\(other\.y - node\.y, other\.x - node\.x\)\)/);
  assert.match(war, /buildCapitalLayout\(\{ id: node\.id, x: node\.x, y: node\.y, roadBearings, structures/);
  assert.match(war, /function publishStrategicCapitals\(state, snapshot\)/);
  assert.match(war, /strategicMap\.locate\(node\)/);
  assert.match(war, /Array\.isArray\(sector\.structures\) \? \[\.\.\.sector\.structures\] : \[\]/);
  assert.match(war, /for \(const placement of layout\.structures \|\| \[\]\)/);
  assert.match(war, /id: root \? `strategic-capital:\$\{node\.id\}` : `strategic-capital:\$\{node\.id\}:\$\{placement\.id\}`/);
  assert.match(war, /structureType: placement\.type/);
  assert.match(war, /x: placement\.x/);
  assert.match(war, /y: placement\.y/);
  assert.match(war, /__strategicCapitalVisual: true/);
  assert.match(war, /host\.war\.bases\.push\(\.\.\.capitals\)/);
  assert.match(war, /stripStrategicCapitalVisuals\(state\);/);
  assert.ok(war.indexOf('stripStrategicCapitalVisuals(state);') < war.indexOf('coreUpdateWar(state, dt)'));
});

test('capital street projection follows the same layout bearings without exposing faction ownership', () => {
  assert.match(war, /function localCapitalRoads\(layouts\)/);
  assert.match(war, /id: `capital-street:\$\{node\.id\}:\$\{road\.id\}:\$\{index\}`/);
  assert.match(war, /from: Object\.freeze\(\{ x: road\.points\[index\]\.x, y: road\.points\[index\]\.y \}\)/);
  assert.match(war, /to: Object\.freeze\(\{ x: point\.x, y: point\.y \}\)/);
  assert.match(war, /localCapitalRoad: true/);
  assert.match(war, /\.\.\.capitalProjection\.roads/);
  assert.doesNotMatch(war, /capital-street:[^\n]*team/);
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