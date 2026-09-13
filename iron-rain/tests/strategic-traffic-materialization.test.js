import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const war = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../modules/battlefield-view.js', import.meta.url), 'utf8');

test('live war projects canonical logistics convoys into bounded local traffic without moving them', () => {
  assert.match(war, /function publishStrategicTraffic\(state\)/);
  assert.match(war, /const snapshot = logistics\.snapshot\(\)/);
  assert.match(war, /convoy\.path\?\.\[convoy\.leg\]/);
  assert.match(war, /convoy\.legProgress/);
  assert.match(war, /friendly \? localDistance > 9_000 : localDistance > 1_200/);
  assert.match(war, /state\.warSimulation\.strategicTraffic = traffic/);
  assert.match(war, /publishStrategicTraffic\(state\)/);
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
