import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSector, updateWar } from '../modules/war-simulation.js';

function makeState() {
  const sector = initializeSector({
    id: 'break-test', name: 'BREAK TEST', x: 10000, y: 20000,
    allyStrength: 65, enemyStrength: 72, assets: []
  }, 0);
  return {
    time: 0,
    robot: { x: 0, y: 0, armor: 100 },
    cam: { x: 0, y: 0 },
    sectors: [sector], smokes: [], tracers: [], shell: null, intel: null,
    warSimulation: { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0, events: [], support: [], serial: 0 }
  };
}

test('a heavily suppressed assault breaks immediately instead of waiting for phase timeout', () => {
  const state = makeState();
  const force = state.sectors[0].war.ally;
  force.phase = 'assault';
  force.phaseTime = 8;
  force.suppression = .95;
  force.advance = 120;
  const beforeAdvance = force.advance;

  updateWar(state, 1);

  assert.equal(force.phase, 'retreat');
  assert.ok(force.phaseTime > 0, 'retreat receives its own phase timer');
  assert.ok(force.advance < beforeAdvance, 'broken infantry starts giving ground on the same strategic tick');
});
