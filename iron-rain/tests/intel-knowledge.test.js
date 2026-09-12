import test from 'node:test';
import assert from 'node:assert/strict';
import { INTEL_AGE_LIMITS, assessIntelAge, intelAgeLabel, exactMarkerAllowed } from '../modules/intel-knowledge.js';

const report = reportedAt => ({ id: 'enemy-contact', reportedAt });

test('intel age transitions preserve partial information without pretending stale reports are live', () => {
  const fresh = assessIntelAge(report(0), INTEL_AGE_LIMITS.fresh);
  assert.equal(fresh.state, 'fresh');
  assert.equal(fresh.confidence, 1);
  assert.equal(fresh.uncertainty, 0);
  assert.equal(exactMarkerAllowed(report(0), INTEL_AGE_LIMITS.fresh), true);

  const aging = assessIntelAge(report(0), INTEL_AGE_LIMITS.fresh + 1);
  assert.equal(aging.state, 'aging');
  assert.ok(aging.confidence < 1 && aging.confidence > .55);
  assert.ok(aging.uncertainty >= 80);
  assert.equal(exactMarkerAllowed(report(0), INTEL_AGE_LIMITS.aging), true);

  const stale = assessIntelAge(report(0), INTEL_AGE_LIMITS.aging + 1);
  assert.equal(stale.state, 'stale');
  assert.ok(stale.uncertainty >= 300);
  assert.equal(exactMarkerAllowed(report(0), INTEL_AGE_LIMITS.aging + 1), false);
  assert.match(intelAgeLabel(report(0), INTEL_AGE_LIMITS.aging + 1), /^POSIÇÃO ANTIGA/);

  const lost = assessIntelAge(report(0), INTEL_AGE_LIMITS.lost + 1);
  assert.equal(lost.state, 'lost');
  assert.equal(lost.confidence, 0);
  assert.equal(exactMarkerAllowed(report(0), INTEL_AGE_LIMITS.lost + 1), false);
  assert.equal(intelAgeLabel(report(0), INTEL_AGE_LIMITS.lost + 1), 'CONTATO PERDIDO');
});

test('intel age is monotonic, frozen and conservative for malformed timestamps', () => {
  const aging = assessIntelAge(report(10), 200);
  const stale = assessIntelAge(report(10), 500);
  assert.ok(stale.confidence < aging.confidence);
  assert.ok(stale.uncertainty > aging.uncertainty);
  assert.equal(Object.isFrozen(aging), true);

  const future = assessIntelAge(report(100), 50);
  assert.equal(future.age, 0);
  assert.equal(future.state, 'fresh');

  const invalid = assessIntelAge({ reportedAt: 'unknown' }, 100);
  assert.equal(invalid.state, 'lost');
  assert.equal(invalid.age, Infinity);
  assert.equal(exactMarkerAllowed({ reportedAt: null }, 100), false);
});
