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

test('regroup waits for local supply even when the opposing line is nearly empty', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;
  sector.allyStrength = 45;
  sector.enemyStrength = 5;
  force.phase = 'regroup';
  force.phaseTime = 1;
  force.morale = .6;
  force.suppression = .3;
  force.ammo = .8;
  for (const base of sector.war.bases) if (base.team === 'ally') base.supply = .05;

  updateWar(state, 1);

  assert.equal(force.phase, 'regroup', 'an exposed objective cannot bypass recovery while local supply is exhausted');
  assert.ok(force.phaseTime > 0, 'regroup receives a fresh recovery window while supply remains below the readiness band');
  assert.ok(force.advance <= 0, 'the formation does not start an opportunistic assault from regroup');
});

test('a supplied and recovered formation leaves regroup through the consolidation buffer', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;
  sector.allyStrength = 45;
  sector.enemyStrength = 50;
  force.phase = 'regroup';
  force.phaseTime = 1;
  force.morale = .6;
  force.suppression = .3;
  force.ammo = .8;
  for (const base of sector.war.bases) if (base.team === 'ally') base.supply = .8;

  updateWar(state, 1);

  assert.equal(force.phase, 'consolidate', 'recovered infantry consolidates before returning to the normal tactical selector');
  assert.ok(force.phaseTime > 1, 'consolidation receives a real defensive window instead of collapsing into a same-tick attack');

  const consolidationTime = force.phaseTime;
  updateWar(state, 1);
  assert.equal(force.phase, 'consolidate', 'the recovery buffer persists for its phase window');
  assert.equal(force.phaseTime, consolidationTime - 1, 'consolidation timer advances normally after recovery');
});

test('low local supply blocks a prepared suppress-to-assault transition on a contested front', () => {
  const state = makeState();
  const sector = state.sectors[0];
  const force = sector.war.ally;
  const foe = sector.war.enemy;
  sector.allyStrength = 65;
  sector.enemyStrength = 50;
  force.phase = 'suppress';
  force.phaseTime = 1;
  force.morale = .7;
  force.suppression = .2;
  force.ammo = .8;
  foe.morale = .75;
  foe.suppression = .4;
  for (const base of sector.war.bases) if (base.team === 'ally') base.supply = .05;

  updateWar(state, 1);

  assert.equal(force.phase, 'wait_support', 'a tactically ready force does not assault while local supply is below readiness');
  assert.ok(force.advance <= 0, 'the supply-starved formation does not begin a covered bound');
});