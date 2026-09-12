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

function prepareAssault(state) {
  const force = state.sectors[0].war.ally;
  force.phase = 'assault';
  force.phaseTime = 8;
  force.advance = 120;
  return force;
}

test('a heavily suppressed assault breaks immediately instead of waiting for phase timeout', () => {
  const state = makeState();
  const force = prepareAssault(state);
  force.suppression = .95;
  const beforeAdvance = force.advance;

  updateWar(state, 1);

  assert.equal(force.phase, 'retreat');
  assert.ok(force.phaseTime > 0, 'retreat receives its own phase timer');
  assert.ok(force.advance < beforeAdvance, 'broken infantry starts giving ground on the same strategic tick');
});

test('an assault with collapsed morale breaks on the same strategic tick', () => {
  const state = makeState();
  const force = prepareAssault(state);
  force.morale = .2;
  const beforeAdvance = force.advance;

  updateWar(state, 1);

  assert.equal(force.phase, 'retreat');
  assert.ok(force.lowMorale, 'low-morale state is recorded after the tick');
  assert.ok(force.advance < beforeAdvance, 'low-morale infantry gives ground immediately');
});

test('an assault below the minimum fighting strength breaks immediately', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = prepareAssault(state);
  sector.allyStrength = 22;
  const beforeAdvance = force.advance;

  updateWar(state, 1);

  assert.equal(force.phase, 'retreat');
  assert.ok(force.advance < beforeAdvance, 'understrength infantry gives ground immediately');
});

test('a healthy assault does not falsely break before its phase timer expires', () => {
  const state = makeState();
  const force = prepareAssault(state);
  force.morale = .72;
  force.suppression = .08;

  updateWar(state, 1);

  assert.equal(force.phase, 'assault');
  assert.ok(force.phaseTime > 0, 'healthy assault keeps its active phase timer');
});

test('a broken force gets a full regroup window instead of bouncing straight back to retreat', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;
  sector.allyStrength = 22;
  force.phase = 'retreat';
  force.phaseTime = 1;
  force.advance = -90;

  updateWar(state, 1);
  assert.equal(force.phase, 'regroup', 'expired retreat transitions into regroup while still understrength');
  const regroupTime = force.phaseTime;

  updateWar(state, 1);
  assert.equal(force.phase, 'regroup', 'persistent weakness does not immediately cancel the regroup phase');
  assert.equal(force.phaseTime, regroupTime - 1, 'regroup timer advances normally instead of being reset by break logic');
});
