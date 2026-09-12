import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics } from '../modules/ballistics.js';
import { artilleryCrankGuide, artilleryCrankNotebookRows } from '../modules/artillery-crank-guide.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('guide exposes both manual movements for the inserted charge without selecting one', () => {
  const range = ballistics(5, 30).range;
  const guide = artilleryCrankGuide(range, 5, 40);
  assert.equal(guide.length, 2);
  assert.deepEqual(guide.map(item => item.kind), ['low', 'high']);
  assert.deepEqual(guide.map(item => item.arcLabel), ['BAIXO', 'ALTO']);
  close(guide[0].elevation, 30);
  close(guide[1].elevation, 60);
  close(guide[0].delta, -10);
  close(guide[1].delta, 20);
  assert.deepEqual(guide.map(item => item.direction), ['down', 'up']);
  assert.deepEqual(guide.map(item => item.movementLabel), ['↓ 10.0°', '↑ 20.0°']);
  assert.deepEqual(guide.map(item => item.instructionLabel), ['BAIXO · ↓ 10.0°', 'ALTO · ↑ 20.0°']);
  assert.ok(Object.isFrozen(guide));
  assert.ok(guide.every(Object.isFrozen));
});

test('guide reports hold when the current elevation already matches an arc', () => {
  const range = ballistics(5, 30).range;
  const guide = artilleryCrankGuide(range, 5, 30);
  assert.equal(guide[0].direction, 'hold');
  assert.equal(guide[0].movementLabel, 'SEGURE');
  assert.equal(guide[0].instructionLabel, 'BAIXO · SEGURE');
  close(guide[0].delta, 0);
});

test('guide treats sub-display-step correction as hold instead of showing 0.0 degrees', () => {
  const range = ballistics(5, 30).range;
  const nearlyLow = artilleryCrankGuide(range, 5, 30.04)[0];
  const visibleCorrection = artilleryCrankGuide(range, 5, 30.06)[0];

  close(nearlyLow.delta, -0.04);
  assert.equal(nearlyLow.direction, 'hold');
  assert.equal(nearlyLow.movementLabel, 'SEGURE');
  assert.equal(nearlyLow.instructionLabel, 'BAIXO · SEGURE');

  close(visibleCorrection.delta, -0.06);
  assert.equal(visibleCorrection.direction, 'down');
  assert.equal(visibleCorrection.movementLabel, '↓ 0.1°');
});

test('guide labels fractional manual correction without changing the underlying solution', () => {
  const range = ballistics(5, 30).range;
  const guide = artilleryCrankGuide(range, 5, 39.75);
  close(guide[0].delta, -9.75);
  close(guide[1].delta, 20.25);
  assert.equal(guide[0].movementLabel, '↓ 9.8°');
  assert.equal(guide[1].movementLabel, '↑ 20.3°');
});

test('guide preserves a single apex arc label without inventing low or high selection', () => {
  const range = ballistics(5, 45).range;
  const guide = artilleryCrankGuide(range, 5, 40);
  assert.equal(guide.length, 1);
  assert.equal(guide[0].kind, 'single');
  assert.equal(guide[0].arcLabel, 'ÚNICO');
  assert.equal(guide[0].instructionLabel, 'ÚNICO · ↑ 5.0°');
});

test('notebook rows preserve the full seven-charge table and decorate only the inserted charge', () => {
  const range = ballistics(5, 30).range;
  const rows = artilleryCrankNotebookRows(range, 5, 40);
  const current = rows.find(row => row.current);
  const other = rows.find(row => !row.current && row.arcs.length);
  const unreachable = rows.find(row => !row.arcs.length);

  assert.equal(rows.length, 7);
  assert.ok(current);
  assert.deepEqual(current.arcs.map(arc => arc.kind), ['low', 'high']);
  assert.deepEqual(current.arcs.map(arc => arc.crankCue?.instructionLabel), ['BAIXO · ↓ 10.0°', 'ALTO · ↑ 20.0°']);
  assert.ok(other);
  assert.ok(other.arcs.every(arc => arc.crankCue === null));
  assert.ok(unreachable);
  assert.deepEqual(unreachable.arcs, []);
  assert.ok(Object.isFrozen(rows));
  assert.ok(rows.every(Object.isFrozen));
  assert.ok(rows.every(row => Object.isFrozen(row.arcs) && row.arcs.every(Object.isFrozen)));
});

test('notebook crank decoration preserves shared ballistics values', () => {
  const range = ballistics(5, 30).range;
  const row = artilleryCrankNotebookRows(range, 5, 40).find(entry => entry.current);
  const low = row.arcs.find(arc => arc.kind === 'low');
  const high = row.arcs.find(arc => arc.kind === 'high');

  close(low.elevation, 30);
  close(high.elevation, 60);
  close(low.apex, ballistics(5, 30).apex);
  close(high.apex, ballistics(5, 60).apex);
  close(low.tof, ballistics(5, 30).tof);
  close(high.tof, ballistics(5, 60).tof);
});

test('guide fails closed when the inserted charge cannot reach the plotted range', () => {
  const range = ballistics(7, 45).range;
  assert.deepEqual(artilleryCrankGuide(range, 1, 45), []);
});

test('guide rejects non-finite current elevation', () => {
  assert.throws(() => artilleryCrankGuide(1000, 1, Number.NaN), /currentElevation must be finite/);
  assert.throws(() => artilleryCrankNotebookRows(1000, 1, Number.NaN), /currentElevation must be finite/);
});
