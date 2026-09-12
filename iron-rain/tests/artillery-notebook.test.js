import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics } from '../modules/ballistics.js';
import { artilleryNotebookRows } from '../modules/artillery-notebook.js';

const close = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ~= ${expected}`);

test('artillery notebook rows preserve ballistic truth without choosing a firing solution', () => {
  const range = ballistics(5, 30).range;
  const rows = artilleryNotebookRows(range, 5);
  const row = rows.find(entry => entry.charge === 5);

  assert.ok(Object.isFrozen(rows));
  assert.ok(row);
  assert.equal(row.current, true);
  assert.ok(Object.isFrozen(row));
  assert.ok(Object.isFrozen(row.arcs));
  assert.equal(row.arcs.length, 2);
  assert.deepEqual(row.arcs.map(arc => arc.kind), ['low', 'high']);

  for (const arc of row.arcs) {
    const solution = ballistics(row.charge, arc.elevation);
    assert.ok(Object.isFrozen(arc));
    close(solution.range, range);
    close(arc.apex, solution.apex);
    close(arc.tof, solution.tof);
  }
});

test('artillery notebook marks only the current charge and stays read-only for unreachable ranges', () => {
  const range = ballistics(4, 45).range;
  const rows = artilleryNotebookRows(range, 4);
  assert.equal(rows.filter(row => row.current).length, 1);
  assert.equal(rows.find(row => row.current)?.charge, 4);
  assert.deepEqual(artilleryNotebookRows(1e9, 4), []);
});

test('artillery notebook ignores invalid current-charge markers instead of selecting an arc', () => {
  const range = ballistics(3, 45).range;
  const rows = artilleryNotebookRows(range, 3.5);
  assert.ok(rows.length > 0);
  assert.equal(rows.some(row => row.current), false);
});
