import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapFacade = await readFile(new URL('../modules/strategic-war-live.js', import.meta.url), 'utf8');
const warFacade = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');

test('strategic map facade preserves the canonical reserve bridge', () => {
  assert.match(mapFacade, /const combatReserveContext = globalThis\.ironRainStrategicMap\?\.combatReserveContext/);
  assert.match(mapFacade, /combatReserveContext: \(sectorId, team\) => combatReserveContext\?\.\(sectorId, team\) \|\| null/);
});

test('contested live fronts stage reserves through friendly rear territory', () => {
  assert.match(warFacade, /COMBAT_RESERVE_REAR_STEPS = Object\.freeze\(\[9_000, 12_000, 15_500, 19_000, 24_000\]\)/);
  assert.match(warFacade, /const direct = strategicMap\.combatReserveContext\(sectorId, team\)/);
  assert.match(warFacade, /context\.territory\.structures\?\.some\?\./);
  assert.match(warFacade, /const direction = team === 'ally' \? -1 : 1/);
  assert.match(warFacade, /strategicMap\.locate\(\{ x: center\.x \+ direction \* metres, y: center\.y \}\)/);
  assert.match(warFacade, /if \(!staging \|\| staging\.owner !== team\) continue/);
  assert.match(warFacade, /strategicMap\.combatReserveContext\(staging\.id, team\)/);
  assert.doesNotMatch(warFacade, /createStrategicLogistics|createSupplyRoute/, 'combat staging must consume the shared map/logistics runtime rather than create another graph');
});
