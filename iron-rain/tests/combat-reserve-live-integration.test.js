import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSector, updateWar } from '../modules/war-simulation-core.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function logisticsGraph() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'ALLY-REAR', team: 'ally', kind: 'depot' }),
      createLogisticsNode({ id: 'ALLY-FRONT', team: 'ally', kind: 'front', assets: { troops: 4 } }),
    ],
    routes: [createSupplyRoute({ id: 'REAR-FRONT', team: 'ally', from: 'ALLY-REAR', to: 'ALLY-FRONT', distance: 900 })],
  });
}

function state({ strategic = true, context = null } = {}) {
  const sector = {
    id: 'TACTICAL-1',
    name: 'Test Front',
    x: 20_000,
    y: 20_000,
    assets: [],
    allyStrength: 80,
    enemyStrength: 0,
    progress: 0,
    ...(strategic ? { strategicSectorId: 'ALLY-FRONT' } : {}),
  };
  initializeSector(sector, 0);
  sector.war.ally.reinforcementsIn = 0;
  sector.war.ally.fallbackUntil = 0;
  return {
    paused: false,
    sectors: [sector],
    smokes: [],
    tracers: [],
    effects: [],
    world: { w: 80_000, h: 64_000 },
    warSimulation: {
      clock: 0,
      accumulator: 0,
      impacts: [],
      strategicTicks: 0,
      detailedFronts: 0,
      combatReserveContext: context,
    },
  };
}

const territory = Object.freeze({ owner: 'ally', contested: false, structures: ['outpost', 'depot'] });

test('live strategic reserves stay due while the canonical route is cut, then arrive when it reopens', () => {
  const logistics = logisticsGraph();
  const current = state({
    context: ({ sectorId, team }) => sectorId === 'ALLY-FRONT' && team === 'ally'
      ? { strategicLogistics: logistics, territory, to: sectorId }
      : null,
  });
  const force = current.sectors[0].war.ally;

  logistics.setRouteOpen('REAR-FRONT', false);
  updateWar(current, 1);
  assert.equal(current.sectors[0].allyStrength, 80);
  assert.equal(force.reinforcementsIn, 0);

  logistics.setRouteOpen('REAR-FRONT', true);
  updateWar(current, 1);
  assert.ok(current.sectors[0].allyStrength > 80);
  assert.ok(force.reinforcements > 0);
  assert.ok(force.reinforcementsIn > 0);
});

test('strategic-aligned fronts fail closed instead of falling back to local base supply', () => {
  const current = state({ context: null });
  const force = current.sectors[0].war.ally;

  updateWar(current, 1);
  assert.equal(current.sectors[0].allyStrength, 80);
  assert.equal(force.reinforcements, 0);
  assert.equal(force.reinforcementsIn, 0);
});

test('isolated non-strategic simulations retain the legacy reserve compatibility path', () => {
  const current = state({ strategic: false, context: null });
  updateWar(current, 1);
  assert.ok(current.sectors[0].allyStrength > 80);
  assert.ok(current.sectors[0].war.ally.reinforcements > 0);
});
