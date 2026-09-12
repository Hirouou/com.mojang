import test from 'node:test';
import assert from 'node:assert/strict';
import { INTEL_AGE_LIMITS, assessIntelAge, intelAgeLabel, exactMarkerAllowed, mapIntelDisclosure } from '../modules/intel-knowledge.js';

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

test('map disclosure degrades exact coordinates into uncertainty and finally removes them', () => {
  const known = { id: 'scout-1', x: 14500, y: 22100, reportedAt: 0 };

  const fresh = mapIntelDisclosure(known, 20);
  assert.deepEqual({ mode: fresh.mode, x: fresh.x, y: fresh.y }, { mode: 'exact', x: 14500, y: 22100 });
  assert.equal(fresh.uncertainty, 0);
  assert.equal(Object.isFrozen(fresh), true);

  const stale = mapIntelDisclosure(known, INTEL_AGE_LIMITS.aging + 10);
  assert.equal(stale.mode, 'area');
  assert.equal(stale.x, 14500);
  assert.equal(stale.y, 22100);
  assert.ok(stale.uncertainty >= 300);
  assert.match(stale.label, /^POSIÇÃO ANTIGA/);

  const lost = mapIntelDisclosure(known, INTEL_AGE_LIMITS.lost + 1);
  assert.equal(lost.mode, 'lost');
  assert.equal(lost.x, null);
  assert.equal(lost.y, null);
  assert.equal(lost.label, 'CONTATO PERDIDO');
});

test('map disclosure fails closed when a report has no usable point', () => {
  const malformed = mapIntelDisclosure({ reportedAt: 10, x: '???', y: 20 }, 20);
  assert.equal(malformed.mode, 'lost');
  assert.equal(malformed.x, null);
  assert.equal(malformed.y, null);
});
