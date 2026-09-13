import test from 'node:test';
import assert from 'node:assert/strict';
import { createMamuteTacticalLifecycle } from '../modules/theatre-mamute-lifecycle.js';

test('lifecycle materializes only focus and nearby while distant stays strategic', () => {
  const calls = [];
  const lifecycle = createMamuteTacticalLifecycle({
    spawn: record => calls.push(['spawn', record.id]),
    update: record => calls.push(['update', record.id]),
    despawn: id => calls.push(['despawn', id]),
  });

  const first = lifecycle.apply({
    focus: { id: 'focus', x: 0, y: 0 },
    nearby: [{ id: 'near', x: 100, y: 0 }],
    distant: [{ id: 'far', x: 9000, y: 0 }],
    mapContacts: [{ id: 'intel-only', x: 5000, y: 0 }],
  });

  assert.deepEqual(first.activeIds, ['focus', 'near']);
  assert.deepEqual(calls, [['spawn', 'focus'], ['spawn', 'near']]);
  assert.equal(first.activeIds.includes('far'), false);
  assert.equal(first.activeIds.includes('intel-only'), false);
});

test('lifecycle updates retained entities and despawns records leaving nearby bubble', () => {
  const calls = [];
  const lifecycle = createMamuteTacticalLifecycle({
    spawn: record => calls.push(['spawn', record.id]),
    update: (record, previous) => calls.push(['update', record.id, previous.x, record.x]),
    despawn: id => calls.push(['despawn', id]),
  });

  lifecycle.apply({ focus: { id: 'focus', x: 0 }, nearby: [{ id: 'a', x: 10 }] });
  calls.length = 0;
  const next = lifecycle.apply({ focus: { id: 'focus', x: 1 }, nearby: [{ id: 'b', x: 20 }], distant: [{ id: 'a', x: 30 }] });

  assert.deepEqual(next.activeIds, ['focus', 'b']);
  assert.deepEqual(next.despawned, ['a']);
  assert.deepEqual(next.spawned, ['b']);
  assert.deepEqual(next.updated, ['focus']);
  assert.deepEqual(calls, [['despawn', 'a'], ['update', 'focus', 0, 1], ['spawn', 'b']]);
});

test('null snapshot resets tactical entities without consulting intel', () => {
  const removed = [];
  const lifecycle = createMamuteTacticalLifecycle({ despawn: id => removed.push(id) });
  lifecycle.apply({ focus: { id: 'focus' }, nearby: [{ id: 'near' }] });

  const result = lifecycle.apply(null);
  assert.deepEqual(result.activeIds, []);
  assert.deepEqual(result.despawned, ['focus', 'near']);
  assert.deepEqual(removed, ['focus', 'near']);
});
