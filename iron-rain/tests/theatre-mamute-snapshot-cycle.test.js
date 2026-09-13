import test from 'node:test';
import assert from 'node:assert/strict';
import { createTheatreMamuteSnapshotCycle } from '../modules/theatre-mamute-snapshot.js';

test('snapshot cycle carries retention between ticks and resets when focus changes', () => {
  const cycle = createTheatreMamuteSnapshotCycle();
  const roster = [
    { id: 'focus-a', faction: 'ALIADOS', x: 0, y: 0 },
    { id: 'focus-b', faction: 'ALIADOS', x: 5000, y: 0 },
    { id: 'retained', faction: 'EIXO', x: 900, y: 0 },
    { id: 'challenger', faction: 'EIXO', x: 950, y: 0 },
  ];

  const first = cycle.build({ roster, focusId: 'focus-a', viewerFaction: 'ALIADOS', radius: 1000, maxNearby: 1 });
  assert.deepEqual(first.nearby.map(record => record.id), ['retained']);

  roster[2] = { ...roster[2], x: 1090 };
  roster[3] = { ...roster[3], x: 800 };
  const retained = cycle.build({ roster, focusId: 'focus-a', viewerFaction: 'ALIADOS', radius: 1000, maxNearby: 1 });
  assert.deepEqual(retained.nearby.map(record => record.id), ['retained']);

  roster[2] = { ...roster[2], x: 900 };
  roster[3] = { ...roster[3], x: 2000 };
  const switched = cycle.build({ roster, focusId: 'focus-b', viewerFaction: 'ALIADOS', radius: 4500, maxNearby: 1 });
  assert.deepEqual(switched.nearby.map(record => record.id), ['challenger']);
});

test('snapshot cycle never promotes retained tactical enemies into map contacts', () => {
  const cycle = createTheatreMamuteSnapshotCycle();
  const roster = [
    { id: 'focus', faction: 'ALIADOS', x: 0, y: 0 },
    { id: 'enemy', faction: 'EIXO', x: 900, y: 0 },
  ];

  cycle.build({ roster, focusId: 'focus', viewerFaction: 'ALIADOS', radius: 1000, maxNearby: 1 });
  roster[1] = { ...roster[1], x: 1090 };
  const next = cycle.build({ roster, focusId: 'focus', viewerFaction: 'ALIADOS', radius: 1000, maxNearby: 1 });

  assert.deepEqual(next.nearby.map(record => record.id), ['enemy']);
  assert.equal(next.mapContacts.some(contact => contact.id === 'enemy'), false);
});
