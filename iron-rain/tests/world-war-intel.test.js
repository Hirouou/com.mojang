import test from 'node:test';
import assert from 'node:assert/strict';
import { updateWar, WAR_LIMITS } from '../modules/war-simulation.js';

function makeState() {
  return {
    paused: false,
    mode: 'artillery',
    sectors: [],
    robot: null,
    cam: null,
    shell: null,
    intel: null,
    smokes: [],
    tracers: [],
    warSimulation: {
      clock: 100,
      accumulator: 0,
      impacts: [],
      strategicTicks: 0,
      detailedFronts: 0,
      events: [
        { id: 'ally-old', time: 0, team: 'ally', type: 'capture' },
        { id: 'enemy-fresh', time: 100 - WAR_LIMITS.enemyIntelLifetime + 1, team: 'enemy', type: 'capture' },
        { id: 'enemy-stale', time: 100 - WAR_LIMITS.enemyIntelLifetime - 1, team: 'enemy', type: 'capture' }
      ],
      support: [],
      playerHits: [],
      serial: 3,
      nextBomberAt: 1000,
      nextBomberTeam: 'ally',
      playerThreatCooldown: 2.4
    }
  };
}

test('fog of war expires stale enemy events but keeps allied and recent intel', () => {
  const state = makeState();
  updateWar(state, 0.1);
  assert.deepEqual(state.warSimulation.events.map(event => event.id), ['ally-old', 'enemy-fresh']);
});
