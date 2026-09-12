import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics } from '../modules/ballistics.js';
import { artilleryCrankGuide } from '../modules/artillery-crank-guide.js';

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

test('guide fails closed when the inserted charge cannot reach the plotted range', () => {
  const range = ballistics(7, 45).range;
  assert.deepEqual(artilleryCrankGuide(range, 1, 45), []);
});

test('guide rejects non-finite current elevation', () => {
  assert.throws(() => artilleryCrankGuide(1000, 1, Number.NaN), /currentElevation must be finite/);
});
