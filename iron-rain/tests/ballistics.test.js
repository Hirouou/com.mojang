import test from 'node:test';
import assert from 'node:assert/strict';
import { ballistics, bearingVector, chargeBand, elevationsForRange, notebookSolutions, sampleTrajectory, CHARGES, MIN_ELEVATION, MAX_ELEVATION, WIND_ACCELERATION } from '../modules/ballistics.js';

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const origin = { x: 8200, y: 30000 };
const stillAir = { x: 0, y: 0 };

test('all 35 charge/elevation pairs land exactly at their displayed nominal range', async t => {
  for (let charge = 1; charge < CHARGES.length; charge++) {
    for (const elevation of [15, 30, 45, 65, 80]) {
      await t.test(`C${charge} at ${elevation}°`, () => {
        const solution = ballistics(charge, elevation);
        const launch = sampleTrajectory(solution, origin, 117, stillAir, 0);
        const apex = sampleTrajectory(solution, origin, 117, stillAir, solution.tof / 2);
        const impact = sampleTrajectory(solution, origin, 117, stillAir, solution.tof);
        close(launch.x, origin.x); close(launch.y, origin.y); close(launch.z, 0);
        close(Math.hypot(impact.x - origin.x, impact.y - origin.y), solution.range);
        close(apex.z, solution.apex);
        assert.ok(apex.z > 0 && solution.tof > 0);
        close(impact.z, 0);
        assert.equal(launch.landed, false);
        assert.equal(impact.landed, true);
      });
    }
  }
});

test('charge table continuously covers 1–50 km and bands agree with every allowed elevation', () => {
  let coveredUntil = chargeBand(1).min;
  assert.ok(coveredUntil <= 1000);
  for (let charge = 1; charge < CHARGES.length; charge++) {
    const band = chargeBand(charge);
    assert.ok(band.min <= coveredUntil, `Gap before charge ${charge}`);
    close(band.max, CHARGES[charge].maxRange);
    close(ballistics(charge, MAX_ELEVATION).range, band.min);
    for (let elevation = MIN_ELEVATION; elevation <= MAX_ELEVATION; elevation += 0.25) {
      const range = ballistics(charge, elevation).range;
      assert.ok(range >= band.min - 1e-7 && range <= band.max + 1e-7);
    }
    coveredUntil = band.max;
  }
  assert.ok(coveredUntil >= 50000);
  // Every requested whole kilometre has at least one usable charge.
  for (let distance = 1000; distance <= 50000; distance += 1000) {
    assert.ok(CHARGES.slice(1).some(c => { const band = chargeBand(c.id); return distance >= band.min && distance <= band.max; }));
  }
});

test('notebook range solver returns only mechanically valid low/high arcs and round-trips their range', () => {
  for (let charge = 1; charge < CHARGES.length; charge++) {
    const band = chargeBand(charge);
    const shortRange = band.min;
    const shortSolutions = elevationsForRange(charge, shortRange);
    assert.deepEqual(shortSolutions.length, 1);
    close(shortSolutions[0], MAX_ELEVATION);
    close(ballistics(charge, shortSolutions[0]).range, shortRange);

    const twoArcRange = ballistics(charge, 30).range;
    const twoArcSolutions = elevationsForRange(charge, twoArcRange);
    assert.equal(twoArcSolutions.length, 2);
    close(twoArcSolutions[0], 30);
    close(twoArcSolutions[1], 60);
    for (const elevation of twoArcSolutions) close(ballistics(charge, elevation).range, twoArcRange);

    const maxSolutions = elevationsForRange(charge, band.max);
    assert.equal(maxSolutions.length, 1);
    close(maxSolutions[0], 45);
    assert.ok(Object.isFrozen(maxSolutions));
    assert.deepEqual(elevationsForRange(charge, band.min - 1), []);
    assert.deepEqual(elevationsForRange(charge, band.max + 1), []);
  }
});

test('manual notebook solutions enumerate reachable charges without choosing a firing setting', () => {
  const range = ballistics(4, 30).range;
  const rows = notebookSolutions(range);
  const expectedCharges = CHARGES.slice(1)
    .filter(charge => { const band = chargeBand(charge.id); return range >= band.min && range <= band.max; })
    .map(charge => charge.id);

  assert.deepEqual(rows.map(row => row.charge), expectedCharges);
  assert.ok(Object.isFrozen(rows));
  assert.ok(rows.length > 1, 'overlap should leave the operator with a manual charge choice');
  for (const row of rows) {
    const band = chargeBand(row.charge);
    close(row.min, band.min);
    close(row.max, band.max);
    assert.ok(Object.isFrozen(row));
    assert.ok(Object.isFrozen(row.elevations));
    assert.ok(row.elevations.length >= 1 && row.elevations.length <= 2);
    for (const elevation of row.elevations) {
      assert.ok(elevation >= MIN_ELEVATION && elevation <= MAX_ELEVATION);
      close(ballistics(row.charge, elevation).range, range);
    }
  }
  assert.deepEqual(notebookSolutions(CHARGES.at(-1).maxRange + 1), []);
});

test('bearing convention is correct in all quadrants, with no world-border clamp', () => {
  const solution = ballistics(7, 45);
  for (const [bearing, dx, dy] of [[0, 0, -1], [90, 1, 0], [180, 0, 1], [270, -1, 0]]) {
    const impact = sampleTrajectory(solution, origin, bearing, stillAir, solution.tof);
    close(impact.x, origin.x + dx * solution.range);
    close(impact.y, origin.y + dy * solution.range);
  }
  const beyondMap = sampleTrajectory(solution, { x: 79000, y: 59000 }, 90, stillAir, 9999);
  close(beyondMap.x, 134000);
  assert.equal(beyondMap.landed, true);
  close(beyondMap.z, 0);
});

test('renderer bearing vector and projectile bearing share the same map direction', () => {
  const origin = { x: 1200, y: 3400 }, solution = ballistics(4, 45);
  for (const bearing of [0, 37, 90, 143, 180, 251, 270, 359]) {
    const vector = bearingVector(bearing);
    const start = sampleTrajectory(solution, origin, bearing, { x: 0, y: 0 }, 0);
    const end = sampleTrajectory(solution, origin, bearing, { x: 0, y: 0 }, solution.tof);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    close((end.x - start.x) / length, vector.x);
    close((end.y - start.y) / length, vector.y);
  }
});

test('a flight is independent of sample cadence, including low-frame-rate overshoot', () => {
  const solution = ballistics(6, 65);
  const wind = { x: 7, y: -5 };
  const endpoint = sampleTrajectory(solution, origin, 32, wind, solution.tof);
  for (const dt of [1 / 144, 1 / 60, 1 / 15, 0.1, 1.8, 8]) {
    let elapsed = 0;
    let sample;
    do { elapsed += dt; sample = sampleTrajectory(solution, origin, 32, wind, elapsed); } while (!sample.landed);
    assert.deepEqual(sample, endpoint);
  }
  const windy = sampleTrajectory(solution, origin, 32, wind, solution.tof);
  const nominal = sampleTrajectory(solution, origin, 32, stillAir, solution.tof);
  close(windy.x - nominal.x, 0.5 * wind.x * WIND_ACCELERATION * solution.tof ** 2);
  close(windy.y - nominal.y, 0.5 * wind.y * WIND_ACCELERATION * solution.tof ** 2);
  close(windy.z, nominal.z);
});

test('changing charge changes the physical flight and existing launch solutions stay immutable', () => {
  const low = ballistics(1, 45);
  const high = ballistics(7, 45);
  assert.ok(high.range > 19 * low.range);
  assert.ok(high.apex > low.apex && high.tof > low.tof);
  assert.ok(Object.isFrozen(low));
  assert.throws(() => { low.v = high.v; }, TypeError);
  close(sampleTrajectory(low, origin, 90, stillAir, low.tof).x - origin.x, 2800);
});

test('invalid charges and non-finite inputs fail clearly; elevation follows mechanical stops', () => {
  for (const charge of [0, 8, 1.5, NaN]) assert.throws(() => ballistics(charge, 45), RangeError);
  assert.throws(() => ballistics(1, NaN), TypeError);
  assert.throws(() => elevationsForRange(1, NaN), TypeError);
  assert.throws(() => notebookSolutions(NaN), TypeError);
  assert.throws(() => elevationsForRange(0, 1000), RangeError);
  assert.equal(ballistics(1, -20).elevation, MIN_ELEVATION);
  assert.equal(ballistics(1, 180).elevation, MAX_ELEVATION);
  assert.throws(() => sampleTrajectory(ballistics(1, 45), origin, 0, stillAir, Infinity), TypeError);
});