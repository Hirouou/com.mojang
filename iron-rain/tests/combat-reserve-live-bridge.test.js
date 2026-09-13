import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const facade = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
const strategic = await readFile(new URL('../modules/strategic-war-live-v3.js', import.meta.url), 'utf8');

test('live war bridge exposes only canonical territory/logistics reserve context', () => {
  assert.match(strategic, /function combatReserveContext\(sectorId, team\)/);
  assert.match(strategic, /strategicLogistics: theatre\.logistics/);
  assert.match(strategic, /territory: territorySnapshot\(node\)/);
  assert.match(strategic, /to: id/);
  assert.match(strategic, /node\.owner !== team/);
  assert.match(strategic, /endpoint\.team !== team/);
});

test('war simulation refreshes canonical reserve context before the core step', () => {
  assert.match(facade, /function refreshCombatReserveContext\(state\)/);
  assert.match(facade, /state\.warSimulation\.combatReserveContext = typeof strategicMap\?\.combatReserveContext === 'function'/);
  const refresh = facade.indexOf('refreshCombatReserveContext(state);');
  const core = facade.indexOf('coreUpdateWar(state, dt);');
  assert.ok(refresh >= 0 && core > refresh, 'reserve context must be refreshed before coreUpdateWar');
});
