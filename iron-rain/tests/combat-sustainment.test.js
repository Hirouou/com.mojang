import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { combatRecoveryPhase, COMBAT_RECOVERY_THRESHOLDS } from '../modules/combat-recovery.js';
import { combatSustainmentSupply } from '../modules/combat-sustainment.js';

function graph({ ammo = 80, connected = true, knownThreat = 0, includeRouteIntel = true, fieldKind = 'outpost' } = {}) {
  const nodes = new Map([
    ['rear', { id: 'rear', alive: true, team: 'ally', kind: 'depot', stock: { ammo: 220 } }],
    ['field', { id: 'field', alive: true, team: 'ally', kind: fieldKind, stock: { ammo } }],
  ]);
  const routeId = 'rear-field';
  return {
    getNode(id) { return nodes.get(id) || null; },
    snapshot() { return { nodes: [...nodes.values()], routes: includeRouteIntel ? [{ id: routeId, from: 'rear', to: 'field', knownThreat }] : [] }; },
    route(team, from, to) { return connected && team === 'ally' && from === 'rear' && to === 'field' ? [{ routeId, from, to, distance: 9_000 }] : null; },
  };
}

const territory = Object.freeze({ owner: 'ally', contested: false, structures: ['outpost'] });

test('combat sustainment follows canonical route and field stock without creating supply', () => {
  const healthy = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 80 }), territory, team: 'ally', to: 'field' });
  const low = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 1 }), territory, team: 'ally', to: 'field' });
  const empty = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 0 }), territory, team: 'ally', to: 'field' });
  const cut = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 80, connected: false }), territory, team: 'ally', to: 'field' });

  assert.ok(healthy > .6 && healthy <= 1, `expected healthy sustainment, got ${healthy}`);
  assert.ok(low > .08 && low < .3, `expected low-but-present ammo to remain scarce, got ${low}`);
  assert.equal(empty, .08, 'empty field ammunition must fail closed even when the road and outpost are healthy');
  assert.equal(cut, .08);
  assert.equal(combatSustainmentSupply({ strategicLogistics: graph(), territory, team: 'enemy', to: 'field' }), .08);
});

test('canonical sustainment fails closed when the routed leg is missing from the route snapshot', () => {
  const supply = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 80, includeRouteIntel: false }), territory, team: 'ally', from: 'rear', to: 'field' });
  assert.equal(supply, .08, 'an internally inconsistent canonical route snapshot must not authorize offensive sustainment');
});

test('combat sustainment requires a physical field logistics node before stock supports an offensive', () => {
  const roadOnlyTerritory = Object.freeze({ owner: 'ally', contested: false, structures: [] });
  const roadOnly = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 80 }), territory: roadOnlyTerritory, team: 'ally', to: 'field' });
  const outpost = combatSustainmentSupply({ strategicLogistics: graph({ ammo: 80 }), territory, team: 'ally', to: 'field' });

  assert.equal(roadOnly, .08, 'ammo parked on a generic road/sector node must not become tactical supply without field infrastructure');
  assert.ok(outpost > .6, 'the same delivered stock should support combat once a canonical field node exists');
});

test('threatened critical logistics nodes can regroup for defense without regaining offensive supply', () => {
  const threatened = graph({ ammo: 80, knownThreat: .74 });
  const routeCut = graph({ ammo: 80, knownThreat: .75 });
  const criticalTerritory = Object.freeze({ owner: 'ally', contested: false, structures: ['depot'] });
  const criticalSupply = combatSustainmentSupply({ strategicLogistics: threatened, territory: criticalTerritory, team: 'ally', to: 'field' });
  const outpostSupply = combatSustainmentSupply({ strategicLogistics: threatened, territory, team: 'ally', to: 'field' });

  assert.equal(criticalSupply, COMBAT_RECOVERY_THRESHOLDS.supply, 'stocked depot keeps only the existing defensive recovery floor under severe known route threat');
  assert.ok(outpostSupply < COMBAT_RECOVERY_THRESHOLDS.supply, 'a basic field node does not receive the critical-infrastructure defensive floor');
  assert.equal(combatSustainmentSupply({ strategicLogistics: routeCut, territory: criticalTerritory, team: 'ally', to: 'field' }), .08, 'the defensive floor never reopens a route rejected by the canonical threat gate');
  assert.equal(combatRecoveryPhase({ phase: 'regroup', strength: 60, morale: .7, suppression: .1, ammo: .8, supply: criticalSupply }), 'consolidate', 'critical-node defenders can reorganize locally instead of remaining permanently broken by route threat');
  assert.equal(combatRecoveryPhase({ phase: 'regroup', strength: 60, morale: .7, suppression: .1, ammo: .8, supply: outpostSupply }), 'regroup', 'ordinary outposts still wait for the threatened supply route to recover');
  assert.equal(combatRecoveryPhase({ phase: 'assault', strength: 60, morale: .7, suppression: .1, ammo: .8, supply: criticalSupply }), 'retreat', 'the defensive floor never authorizes continuing an assault');
});

test('a threatened staging depot cannot hide local road pressure behind a zero-leg route', () => {
  const localDepot = graph({ ammo: 80, knownThreat: .74, fieldKind: 'depot' });
  const criticalTerritory = Object.freeze({ owner: 'ally', contested: false, structures: ['depot'] });
  const supply = combatSustainmentSupply({ strategicLogistics: localDepot, territory: criticalTerritory, team: 'ally', to: 'field' });

  assert.equal(supply, COMBAT_RECOVERY_THRESHOLDS.supply, 'earned threat on an adjacent road keeps a self-staging depot defensive instead of fully supplied for attack');
  assert.equal(combatRecoveryPhase({ phase: 'assault', strength: 60, morale: .7, suppression: .1, ammo: .8, supply }), 'retreat', 'local defenders do not launch or sustain an assault while their depot roads are under known pressure');
});

test('live war wrapper caps tactical base supply from the canonical sustainment seam', async () => {
  const source = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ combatSustainmentSupply \} from '\.\/combat-sustainment\.js';/);
  assert.match(source, /function syncCombatSustainment\(state\)/);
  assert.match(source, /combatSustainmentSupply\(\{ \.\.\.context, team \}\)/);
  assert.match(source, /base\.supply = Math\.min\(Number\(base\.supply\) \|\| 0, supplyCap\)/);
  assert.match(source, /refreshCombatReserveContext\(state\); syncCombatSustainment\(state\);/);
});