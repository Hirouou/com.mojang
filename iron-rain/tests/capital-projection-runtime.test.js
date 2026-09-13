import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSector, updateWar } from '../modules/war-simulation.js';
import { createLogisticsNode, createStrategicLogistics } from '../modules/strategic-logistics.js';

test('capital presentation remains visible without contaminating mutable combat bases across frames', () => {
  const previous = globalThis.ironRainStrategicMap;
  const point = { id: 'DEPOT', x: 20000, y: 20000, owner: 'ally', structures: ['outpost', 'depot'] };
  const logistics = createStrategicLogistics({ nodes: [createLogisticsNode({ ...point, team: 'ally', kind: 'depot' })], routes: [] });
  const sector = { id: 'T1', name: 'Test', x: point.x, y: point.y, assets: [], units: [], allyStrength: 80, enemyStrength: 80, progress: 0, strategicSectorId: point.id };
  initializeSector(sector, 0);
  const state = { time: 0, mode: 'artillery', paused: false, robot: { ...point, armor: 100 }, base: { ...point }, sectors: [sector], smokes: [], tracers: [], effects: [], world: { w: 80000, h: 64000 }, warSimulation: { strategicIntegration: true, strategicAligned: true } };
  Object.assign(state.warSimulation, { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0 });
  globalThis.ironRainStrategicMap = {
    locate: () => ({ sector: point }),
    combatReserveContext: (_, team) => team === 'ally' ? { strategicLogistics: logistics, territory: { ...point, contested: false }, to: point.id } : null,
  };
  try {
    updateWar(state, .016);
    const capital = state.warSimulation.strategicCapitals[0];
    assert.ok(capital, 'the nearby capital must still be projected');
    assert.ok(Object.isFrozen(capital));
    assert.ok(!sector.war.bases.includes(capital), 'render-only capitals cannot receive tactical supply or damage');
    const position = { x: capital.x, y: capital.y, hp: capital.hp };
    for (let frame = 0; frame < 80; frame++) {
      state.time += .016;
      assert.doesNotThrow(() => updateWar(state, .016), `frame ${frame}`);
    }
    assert.deepEqual({ x: capital.x, y: capital.y, hp: capital.hp }, position);
    assert.ok(state.warSimulation.strategicCapitals.length > 0);
    assert.ok(sector.war.bases.every(base => !base.__strategicCapitalVisual && Object.isExtensible(base)));
  } finally { globalThis.ironRainStrategicMap = previous; }
});
