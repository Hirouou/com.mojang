import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTheatreMamuteSnapshot } from '../modules/theatre-mamute-snapshot.js';

test('snapshot keeps canonical tactical materialization separate from fog-gated map contacts', () => {
  const roster = Object.freeze([
    Object.freeze({ id: 'ally-focus', faction: 'ALIADOS', x: 0, y: 0 }),
    Object.freeze({ id: 'axis-near', faction: 'EIXO', x: 100, y: 0 }),
    Object.freeze({ id: 'axis-hidden', faction: 'EIXO', x: 200, y: 0 }),
    Object.freeze({ id: 'ally-far', faction: 'ALIADOS', x: 9000, y: 0 }),
  ]);
  const intelEntries = Object.freeze([
    Object.freeze({ id: 'axis-near', mode: 'area', x: 1250, y: 2400, uncertainty: 600, label: 'RELATO DE RÁDIO' }),
  ]);

  const snapshot = buildTheatreMamuteSnapshot({
    roster,
    focusId: 'ally-focus',
    viewerFaction: 'ALIADOS',
    intelEntries,
    radius: 1000,
    maxNearby: 2,
  });

  assert.ok(snapshot);
  assert.deepEqual(snapshot.tacticalIds, ['axis-near', 'axis-hidden', 'ally-focus']);
  assert.deepEqual(snapshot.nearby.map(record => record.id), ['axis-near', 'axis-hidden']);
  assert.deepEqual(snapshot.distant.map(record => record.id), ['ally-far']);

  const visibleEnemy = snapshot.mapContacts.find(contact => contact.id === 'axis-near');
  assert.deepEqual(visibleEnemy, {
    id: 'axis-near', faction: 'EIXO', relation: 'enemy', mode: 'area',
    label: 'RELATO DE RÁDIO', uncertainty: 600, x: 1250, y: 2400,
  });
  assert.equal(snapshot.mapContacts.some(contact => contact.id === 'axis-hidden'), false);
  assert.equal(snapshot.mapContacts.some(contact => contact.x === 100 || contact.x === 200), false);
});

test('snapshot preserves tactical budget and fails closed when focus is invalid', () => {
  const roster = [
    { id: 'focus', faction: 'ALIADOS', x: 0, y: 0 },
    { id: 'm2', faction: 'ALIADOS', x: 10, y: 0 },
    { id: 'm1', faction: 'ALIADOS', x: -10, y: 0 },
  ];
  const snapshot = buildTheatreMamuteSnapshot({ roster, focusId: 'focus', viewerFaction: 'ALIADOS', maxNearby: 1 });

  assert.equal(snapshot.maxNearby, 1);
  assert.equal(snapshot.nearby.length, 1);
  assert.equal(snapshot.distant.length, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.tacticalIds), true);
  assert.equal(buildTheatreMamuteSnapshot({ roster, focusId: 'missing', viewerFaction: 'ALIADOS' }), null);
});

test('snapshot carries prior nearby ids into tactical retention without bypassing fog', () => {
  const roster = Object.freeze([
    Object.freeze({ id: 'focus', faction: 'ALIADOS', x: 0, y: 0 }),
    Object.freeze({ id: 'retained-enemy', faction: 'EIXO', x: 1090, y: 0 }),
    Object.freeze({ id: 'new-enemy', faction: 'EIXO', x: 900, y: 0 }),
  ]);

  const withoutHistory = buildTheatreMamuteSnapshot({
    roster,
    focusId: 'focus',
    viewerFaction: 'ALIADOS',
    radius: 1000,
    maxNearby: 1,
  });
  assert.deepEqual(withoutHistory.nearby.map(record => record.id), ['new-enemy']);

  const withHistory = buildTheatreMamuteSnapshot({
    roster,
    focusId: 'focus',
    viewerFaction: 'ALIADOS',
    radius: 1000,
    maxNearby: 1,
    previousNearbyIds: ['retained-enemy'],
  });

  assert.deepEqual(withHistory.nearby.map(record => record.id), ['retained-enemy']);
  assert.deepEqual(withHistory.distant.map(record => record.id), ['new-enemy']);
  assert.equal(withHistory.retentionRadius, 1150);
  assert.equal(withHistory.mapContacts.some(contact => contact.id === 'retained-enemy'), false);
  assert.equal(withHistory.mapContacts.some(contact => contact.id === 'new-enemy'), false);
});

test('snapshot drops prior nearby ids after the retention radius is exceeded', () => {
  const roster = [
    { id: 'focus', faction: 'ALIADOS', x: 0, y: 0 },
    { id: 'old', faction: 'EIXO', x: 1200, y: 0 },
    { id: 'new', faction: 'EIXO', x: 900, y: 0 },
  ];

  const snapshot = buildTheatreMamuteSnapshot({
    roster,
    focusId: 'focus',
    viewerFaction: 'ALIADOS',
    radius: 1000,
    maxNearby: 1,
    previousNearbyIds: ['old'],
  });

  assert.deepEqual(snapshot.nearby.map(record => record.id), ['new']);
  assert.deepEqual(snapshot.distant.map(record => record.id), ['old']);
});
