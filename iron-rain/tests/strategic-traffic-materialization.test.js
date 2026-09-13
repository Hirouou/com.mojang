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

test('hostile convoy materialization is earned locally or by active intel target', () => {
  assert.match(war, /function convoyObservedLocally\(state, convoy\)/);
  assert.match(war, /<= 950/);
  assert.match(war, /const target = state\.intel\?\.target/);
  assert.match(war, /target\.id && target\.id === convoy\.id/);
  assert.match(war, /<= 850/);
  assert.match(war, /convoy\?\.team !== own && convoyObservedLocally\(state, convoy\)/);
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
