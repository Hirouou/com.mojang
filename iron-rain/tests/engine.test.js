import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, damageEngine, engineCanDrive, serviceEngine, updateEngine, engineStatus } from '../modules/engine-system.js';

test('small armor scratches damage the engine proportionally without starting a fire', () => {
  const engine = createEngine();
  const hit = damageEngine(engine, 2);
  assert.equal(engine.health, 97.3);
  assert.equal(hit.ignited, false); assert.equal(engine.fire, 0);
  assert.equal(engineCanDrive(engine), true);
  const before = { ...engine }; damageEngine(engine, -20); damageEngine(engine, NaN);
  assert.deepEqual(engine, before);
});

test('a severe hit blocks driving until the player equips and uses the extinguisher', () => {
  const engine = createEngine();
  assert.equal(damageEngine(engine, 22).ignited, true);
  assert.equal(engineCanDrive(engine), false);
  assert.equal(serviceEngine(engine, 'engine').kind, 'needs-extinguisher');
  assert.equal(engine.action, null);
  serviceEngine(engine, 'extinguisher');
  assert.equal(serviceEngine(engine, 'engine').action, 'extinguish');
  updateEngine(engine, 2.9, { nearEngine: true });
  assert.ok(engine.fire > 0); assert.equal(engineCanDrive(engine), false);
  assert.equal(updateEngine(engine, .1, { nearEngine: true }).kind, 'extinguished');
  assert.equal(engine.fire, 0); assert.ok(engine.health < 100);
  assert.equal(engineCanDrive(engine), true);
  assert.equal(engine.hasExtinguisher, true);
});

test('a destroyed engine remains recoverable through extinguishing and six seconds of repair', () => {
  const engine = createEngine(); damageEngine(engine, 100);
  assert.equal(engine.health, 0);
  serviceEngine(engine, 'extinguisher'); serviceEngine(engine, 'engine');
  updateEngine(engine, 3, { nearEngine: true });
  assert.equal(engineCanDrive(engine), false);
  assert.equal(serviceEngine(engine, 'engine').action, 'repair');
  updateEngine(engine, 3, { nearEngine: true });
  assert.equal(engine.repairProgress, .5); assert.equal(engine.repairing, true);
  assert.match(engineStatus(engine), /50%/);
  assert.equal(updateEngine(engine, 3, { nearEngine: true }).kind, 'repaired');
  assert.equal(engine.health, 100); assert.equal(engineCanDrive(engine), true);
  assert.equal(engine.action, null); assert.equal(engine.repairing, false);
});

test('walking away cancels service and cannot complete a repair remotely', () => {
  const engine = createEngine(); damageEngine(engine, 10); serviceEngine(engine, 'engine');
  updateEngine(engine, 2, { nearEngine: true });
  const health = engine.health;
  assert.equal(updateEngine(engine, .1, { nearEngine: false }).kind, 'interrupted');
  updateEngine(engine, 60, { nearEngine: false });
  assert.equal(engine.health, health); assert.equal(engine.action, null);
  assert.equal(engine.repairProgress, 0);
  serviceEngine(engine, 'engine'); updateEngine(engine, 6, { nearEngine: true });
  assert.equal(engine.health, 100);
});

test('fire burns slowly, interrupted extinguishing leaves the fire active, and new damage cancels repair', () => {
  const engine = createEngine(); damageEngine(engine, 20);
  const health = engine.health;
  updateEngine(engine, 5); assert.ok(engine.health < health);
  serviceEngine(engine, 'extinguisher'); serviceEngine(engine, 'engine');
  updateEngine(engine, 1, { nearEngine: true }); updateEngine(engine, .1, { nearEngine: false });
  assert.ok(engine.fire > 0); assert.equal(engine.action, null);
  serviceEngine(engine, 'engine'); updateEngine(engine, 3, { nearEngine: true });
  serviceEngine(engine, 'engine'); updateEngine(engine, 1, { nearEngine: true });
  damageEngine(engine, 18);
  assert.equal(engine.repairing, false); assert.equal(engine.action, null);
  assert.equal(serviceEngine(engine, 'engine').action, 'extinguish');
});

test('one large extinguishing step burns only until the fire is put out', () => {
  const a = createEngine(), b = createEngine();
  for (const engine of [a, b]) {
    damageEngine(engine, 20); serviceEngine(engine, 'extinguisher'); serviceEngine(engine, 'engine');
  }
  updateEngine(a, 20, { nearEngine: true });
  for (let i = 0; i < 20; i++) updateEngine(b, 1, { nearEngine: true });
  assert.ok(Math.abs(a.health - b.health) < 1e-8);
  assert.equal(a.fire, 0); assert.equal(b.fire, 0);
});

test('invalid numeric state cannot create NaN, negative health or unfinished infinite actions', () => {
  const engine = createEngine();
  engine.health = NaN; engine.fire = Infinity;
  engine.action = { type: 'repair', elapsed: NaN, duration: Infinity };
  updateEngine(engine, NaN, { nearEngine: true });
  assert.equal(engine.health, 0); assert.equal(engine.fire, 0);
  assert.equal(engine.action.duration, 6); assert.equal(engine.action.elapsed, 0);
  updateEngine(engine, -2, { nearEngine: true }); assert.equal(engine.health, 0);
  updateEngine(engine, 6, { nearEngine: true }); assert.equal(engine.health, 100);
  assert.equal(engineCanDrive(null), false); assert.equal(updateEngine(null, 1), null);
});
