import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics } from '../modules/ballistics.js';
import { artilleryNotebookRows, artilleryNotebookTableRows } from '../modules/artillery-notebook.js';

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

test('artillery notebook preserves every overlapping manual option in deterministic order', () => {
  const range = ballistics(5, 45).range * 0.72;
  const rows = artilleryNotebookRows(range, 6);

  assert.ok(rows.length >= 2, 'expected overlapping charges at the chosen range');
  assert.deepEqual(rows.map(row => row.charge), [...rows.map(row => row.charge)].sort((a, b) => a - b));
  assert.equal(rows.filter(row => row.current).length, rows.some(row => row.charge === 6) ? 1 : 0);

  for (const row of rows) {
    assert.ok(range >= row.min && range <= row.max, `C${row.charge} must contain the plotted range`);
    assert.ok(row.arcs.length >= 1 && row.arcs.length <= 2);
    assert.deepEqual(row.arcs.map(arc => arc.kind), row.arcs.length === 2 ? ['low', 'high'] : ['single']);
    assert.deepEqual(row.arcs.map(arc => arc.elevation), [...row.arcs.map(arc => arc.elevation)].sort((a, b) => a - b));
    for (const arc of row.arcs) close(ballistics(row.charge, arc.elevation).range, range);
  }
});

test('full notebook table keeps all seven nominal charge rows while only reachable rows expose arcs', () => {
  const range = ballistics(4, 30).range;
  const rows = artilleryNotebookTableRows(range, 2);

  assert.ok(Object.isFrozen(rows));
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(row => row.charge), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(rows.filter(row => row.current).length, 1);
  assert.equal(rows.find(row => row.current)?.charge, 2);

  for (const row of rows) {
    assert.ok(Object.isFrozen(row));
    assert.ok(Object.isFrozen(row.arcs));
    const reachable = range >= row.min && range <= row.max;
    assert.equal(row.arcs.length > 0, reachable, `C${row.charge} reachability must match its shared band`);
    for (const arc of row.arcs) close(ballistics(row.charge, arc.elevation).range, range);
  }
});

test('full notebook table marks current charge even when that charge cannot reach the plotted range', () => {
  const range = ballistics(7, 45).range;
  const rows = artilleryNotebookTableRows(range, 1);
  const current = rows.find(row => row.current);

  assert.equal(current?.charge, 1);
  assert.deepEqual(current?.arcs, []);
  assert.ok(current.max < range);
});
