import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTheatreMamuteMapContacts } from '../modules/theatre-mamute-map.js';

test('enemy Mamute positions come only from earned intel, never canonical roster coordinates', () => {
  const roster = Object.freeze([
    Object.freeze({ id: 'ally-1', faction: 'ALIADOS', x: 10, y: 20 }),
    Object.freeze({ id: 'axis-1', faction: 'EIXO', x: 9000, y: 8000 }),
    Object.freeze({ id: 'axis-2', faction: 'EIXO', x: 7000, y: 6000 }),
  ]);
  const intel = Object.freeze([
    Object.freeze({ id: 'axis-1', mode: 'area', x: 120, y: 240, uncertainty: 500, label: 'CONTATO ANTIGO' }),
  ]);

  const contacts = buildTheatreMamuteMapContacts(roster, 'ALIADOS', intel);
  assert.equal(Object.isFrozen(contacts), true);
  assert.deepEqual(contacts, [
    {
      id: 'ally-1', faction: 'ALIADOS', relation: 'friendly', mode: 'exact',
      label: 'MAMUTE ALIADO', uncertainty: 0, x: 10, y: 20,
    },
    {
      id: 'axis-1', faction: 'EIXO', relation: 'enemy', mode: 'area',
      label: 'CONTATO ANTIGO', uncertainty: 500, x: 120, y: 240,
    },
  ]);
  assert.equal(contacts.some(contact => contact.x === 9000 || contact.y === 8000), false);
  assert.equal(contacts.some(contact => contact.id === 'axis-2'), false);
});

test('lost enemy intel remains textual and does not leak coordinates', () => {
  const contacts = buildTheatreMamuteMapContacts(
    [{ id: 'axis-1', faction: 'EIXO', x: 9000, y: 8000 }],
    'ALIADOS',
    [{ id: 'axis-1', mode: 'lost', x: 111, y: 222, uncertainty: 999, label: 'CONTATO PERDIDO' }],
  );
  assert.deepEqual(contacts[0], {
    id: 'axis-1', faction: 'EIXO', relation: 'enemy', mode: 'lost',
    label: 'CONTATO PERDIDO', uncertainty: 999, x: null, y: null,
  });
  assert.equal(Object.isFrozen(contacts[0]), true);
});

test('invalid enemy intel fails closed', () => {
  const roster = [{ id: 'axis-1', faction: 'EIXO', x: 9, y: 8 }];
  assert.deepEqual(buildTheatreMamuteMapContacts(roster, 'ALIADOS', []), []);
  assert.deepEqual(buildTheatreMamuteMapContacts(roster, 'ALIADOS', [{ id: 'axis-1', mode: 'exact', x: NaN, y: 2 }]), []);
  assert.deepEqual(buildTheatreMamuteMapContacts(roster, '', []), []);
});
