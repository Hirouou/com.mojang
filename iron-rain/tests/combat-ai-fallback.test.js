import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSector, updateWar } from '../modules/war-simulation.js';

function makeState() {
  const sector = initializeSector({
    id: 'fallback-test', name: 'FALLBACK TEST', x: 10000, y: 20000,
    // Keep a real opposing force so the tiny allied platoon is still wiped,
    // but do not let overwhelming combat immediately erase the first reserve
    // packet on the exact recovery tick this focused fallback test observes.
    allyStrength: .04, enemyStrength: 8, assets: []
  }, 0);
  const force = sector.war.ally;
  force.phase = 'assault';
  force.phaseTime = 8;
  force.reinforcementsIn = 1;
  return {
    time: 0,
    robot: { x: 0, y: 0, armor: 100 },
    cam: { x: 0, y: 0 },
    sectors: [sector], smokes: [], tracers: [], shell: null, intel: null,
    warSimulation: { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0, events: [], support: [], serial: 0 }
  };
}

test('a wiped formation cannot receive reserves before its fallback window expires', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;

  updateWar(state, 1);

  assert.equal(sector.allyStrength, 0, 'the wiped formation is pinned to zero strength');
  assert.equal(force.defeated, true, 'the formation enters defeated/fallback state');
  assert.ok(force.fallbackUntil > sector.war.ticks, 'fallback establishes a future recovery tick');
  assert.equal(force.reinforcements, 0, 'no reserve strength arrives on the wipe tick');

  updateWar(state, 10);

  assert.equal(sector.allyStrength, 0, 'strength remains zero while the fallback window is active');
  assert.equal(force.defeated, true, 'the formation stays defeated during fallback');
  assert.equal(force.reinforcements, 0, 'scheduled reserves still cannot bypass fallback');
});

test('reserves can restore a wiped formation after the fallback window completes', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;

  updateWar(state, 1);
  const recoveryTick = force.fallbackUntil;
  const ticksRemaining = recoveryTick - sector.war.ticks;

  updateWar(state, ticksRemaining);

  assert.ok(sector.war.ticks >= recoveryTick, 'the simulation reaches the authorized recovery tick');
  assert.ok(sector.allyStrength > 0, 'reserves restore non-zero fighting strength after fallback');
  assert.ok(force.reinforcements > 0, 'the recovered strength is accounted as reinforcements');
  assert.equal(force.defeated, false, 'the formation leaves defeated state once reserves arrive');
});
