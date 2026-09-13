import test from 'node:test';
import assert from 'node:assert/strict';
import { combatOffensiveReady } from '../modules/combat-recovery.js';
import { initializeSector, updateWar } from '../modules/war-simulation-core.js';

function front({ morale = .7, suppression = .1, ammo = .8, enemyStrength = 5 } = {}) {
  const sector = {
    id: 'READINESS', name: 'READINESS', x: 10_000, y: 10_000,
    assets: [], allyStrength: 60, enemyStrength, progress: 0
  };
  initializeSector(sector, 0);
  Object.assign(sector.war.ally, { phase: 'hold', phaseTime: 5, morale, suppression, ammo, advance: 0 });
  Object.assign(sector.war.enemy, { phase: 'retreat', phaseTime: 5, morale: .4, suppression: .4, ammo: .5, advance: 0 });
  return { sector, state: { sectors: [sector], smokes: [], tracers: [], world: { w: 80_000 } } };
}

test('offensive readiness fails closed on every shared threshold', () => {
  const ready = { morale: .7, suppression: .1, ammo: .8, supply: .78 };
  assert.equal(combatOffensiveReady(ready), true);
  assert.equal(combatOffensiveReady({ ...ready, morale: .37 }), false);
  assert.equal(combatOffensiveReady({ ...ready, suppression: .56 }), false);
  assert.equal(combatOffensiveReady({ ...ready, ammo: .31 }), false);
  assert.equal(combatOffensiveReady({ ...ready, supply: .29 }), false);
  assert.equal(combatOffensiveReady(), false);
});

test('cleared trench does not trigger immediate assault when morale is below offensive readiness', () => {
  const { sector, state } = front({ morale: .37 });
  updateWar(state, 1);
  assert.notEqual(sector.war.ally.phase, 'assault');
  assert.ok(sector.war.ally.advance <= 0, `unexpected advance ${sector.war.ally.advance}`);
});

test('recovered regroup consolidates before exploiting a cleared trench', () => {
  const { sector, state } = front();
  Object.assign(sector.war.ally, { phase: 'regroup', phaseTime: 0, advance: 0 });
  updateWar(state, 1);
  assert.equal(sector.war.ally.phase, 'consolidate');
  assert.ok(sector.war.ally.advance <= 0, `unexpected regroup advance ${sector.war.ally.advance}`);
});

test('ready formation still exploits a cleared trench immediately', () => {
  const { sector, state } = front();
  updateWar(state, 1);
  assert.equal(sector.war.ally.phase, 'assault');
  assert.ok(sector.war.ally.advance > 0, `expected positive advance, got ${sector.war.ally.advance}`);
});
