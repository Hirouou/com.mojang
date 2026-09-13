import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { combatSustainmentSupply } from '../modules/combat-sustainment.js';

function graph({ ammo = 80, connected = true } = {}) {
  const nodes = new Map([
    ['rear', { id: 'rear', alive: true, team: 'ally', kind: 'depot', stock: { ammo: 220 } }],
    ['field', { id: 'field', alive: true, team: 'ally', kind: 'outpost', stock: { ammo } }],
  ]);
  return {
    getNode(id) { return nodes.get(id) || null; },
    snapshot() { return { nodes: [...nodes.values()] }; },
    route(team, from, to) { return connected && team === 'ally' && from === 'rear' && to === 'field' ? [{ from, to, distance: 9_000 }] : null; },
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

test('live war wrapper caps tactical base supply from the canonical sustainment seam', async () => {
  const source = await readFile(new URL('../modules/war-simulation.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ combatSustainmentSupply \} from '\.\/combat-sustainment\.js';/);
  assert.match(source, /function syncCombatSustainment\(state\)/);
  assert.match(source, /combatSustainmentSupply\(\{ \.\.\.context, team \}\)/);
  assert.match(source, /base\.supply = Math\.min\(Number\(base\.supply\) \|\| 0, supplyCap\)/);
  assert.match(source, /refreshCombatReserveContext\(state\); syncCombatSustainment\(state\);/);
});
