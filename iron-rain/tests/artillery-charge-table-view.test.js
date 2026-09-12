import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics } from '../modules/ballistics.js';
import { artilleryChargeTableRows } from '../modules/artillery-charge-table-view.js';

test('charge table exposes manual crank cue only for the inserted charge', () => {
  const range = ballistics(5, 30).range;
  const rows = artilleryChargeTableRows(range, 5, 40);
  const current = rows.find(row => row.current);
  const otherReachable = rows.find(row => !row.current && row.reachable);

  assert.equal(rows.length, 7);
  assert.ok(current);
  assert.deepEqual(current.arcs.map(arc => arc.displayLabel), [
    'BAIXO 30.0° · A 1.400 m · 23.9 s · MANIVELA ↓ 10.0°',
    'ALTO 60.0° · A 4.200 m · 41.3 s · MANIVELA ↑ 20.0°',
  ]);
  assert.ok(current.arcs.every(arc => arc.crankCue));
  assert.ok(otherReachable);
  assert.ok(otherReachable.arcs.every(arc => !arc.displayLabel.includes('MANIVELA')));
  assert.ok(otherReachable.arcs.every(arc => arc.crankCue === null));
});

test('charge table keeps unreachable inserted charge visible without inventing guidance', () => {
  const range = ballistics(7, 45).range;
  const current = artilleryChargeTableRows(range, 1, 45).find(row => row.current);

  assert.ok(current);
  assert.equal(current.charge, 1);
  assert.equal(current.reachable, false);
  assert.deepEqual(current.arcs, []);
});

test('charge table remains deeply immutable at the presentation boundary', () => {
  const rows = artilleryChargeTableRows(ballistics(5, 30).range, 5, 40);
  assert.ok(Object.isFrozen(rows));
  assert.ok(rows.every(row => Object.isFrozen(row) && Object.isFrozen(row.arcs)));
  assert.ok(rows.flatMap(row => row.arcs).every(Object.isFrozen));
});
