import assert from 'node:assert/strict';
import {
  createTheatreMamuteRoster,
  eligibleMamutesForFaction,
  mamutesInSector,
  theatreMamuteRecord,
} from '../modules/theatre-mamutes.js';

const ally = theatreMamuteRecord({
  id: 'm-a-01', faction: 'ALIADOS', regionId: 'hex-1-2', sectorId: 'hex-1-2-s4',
  x: 12_000, y: 18_000, crewCount: 2, deployment: 'deployed', ammunitionRef: 'ammo:m-a-01',
});
assert.ok(ally);
assert.ok(Object.isFrozen(ally));
assert.equal(ally.faction, 'ALIADOS');
assert.equal(ally.crewCount, 2);

assert.equal(theatreMamuteRecord({ ...ally, id: 'bad-faction', faction: 'OUTRO' }), null);
assert.equal(theatreMamuteRecord({ ...ally, id: 'too-many', crewCount: 4 }), null);
assert.equal(theatreMamuteRecord({ ...ally, id: 'no-ammo', ammunitionRef: '' }), null);
assert.equal(theatreMamuteRecord({ ...ally, id: 'no-sector', sectorId: '' }), null);

const roster = createTheatreMamuteRoster([
  ally,
  { id: 'm-a-02', faction: 'ALIADOS', regionId: 'hex-1-2', sectorId: 'hex-1-2-s4', x: 12_500, y: 18_200, crewCount: 3, deployment: 'moving', ammunitionRef: 'ammo:m-a-02' },
  { id: 'm-e-01', faction: 'EIXO', regionId: 'hex-3-2', sectorId: 'hex-3-2-s2', x: 42_000, y: 18_500, crewCount: 1, deployment: 'deployed', ammunitionRef: 'ammo:m-e-01' },
  { id: 'm-e-02', faction: 'EIXO', regionId: 'hex-3-2', sectorId: 'hex-3-2-s2', x: 43_000, y: 19_000, crewCount: 0, deployment: 'disabled', ammunitionRef: 'ammo:m-e-02' },
  { ...ally, faction: 'EIXO' }, // duplicate stable id cannot fork one vehicle across factions
]);
assert.ok(Object.isFrozen(roster));
assert.equal(roster.length, 4);

const allyEligible = eligibleMamutesForFaction(roster, 'ALIADOS');
assert.deepEqual(allyEligible.map(item => item.id), ['m-a-01']);
assert.ok(Object.isFrozen(allyEligible));

const enemyEligible = eligibleMamutesForFaction(roster, 'eixo');
assert.deepEqual(enemyEligible.map(item => item.id), ['m-e-01']);
assert.ok(!enemyEligible.some(item => item.faction === 'ALIADOS'));

const sector = mamutesInSector(roster, 'hex-3-2-s2');
assert.deepEqual(sector.map(item => item.id), ['m-e-01', 'm-e-02']);
assert.equal(mamutesInSector(roster, 'missing').length, 0);

console.log('theatre-mamutes: ok');
