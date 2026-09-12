import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement, touchAimViewLocked } from '../modules/cabin-controls.js';

function fakeDocument(classes = [], station = 'aim') {
  const set = new Set(classes);
  return {
    getElementById(id) {
      if (id === 'app') return { classList: { contains: value => set.has(value) } };
      if (id === 'fireDeck') return { dataset: { station } };
      return null;
    },
  };
}

test('touch aiming locks free-look only while the physical aim station is occupied', () => {
  const doc = fakeDocument(['input-touch', 'inside', 'station-engaged']);
  assert.equal(touchAimViewLocked(doc, () => ({ matches: true })), true);
  assert.equal(touchAimViewLocked(fakeDocument(['input-touch', 'inside']), () => ({ matches: true })), false);
  assert.equal(touchAimViewLocked(fakeDocument(['input-touch', 'inside', 'station-engaged'], 'load'), () => ({ matches: true })), false);
  assert.equal(touchAimViewLocked(fakeDocument(['input-mouse', 'inside', 'station-engaged']), () => ({ matches: false })), false);
});

test('movement look ignores touch drag at aim station but remains available on desktop', () => {
  const oldDocument = globalThis.document;
  const oldMatchMedia = globalThis.matchMedia;
  const movement = createCabinMovement();
  const startYaw = movement.yaw, startPitch = movement.pitch;

  try {
    globalThis.document = fakeDocument(['input-touch', 'inside', 'station-engaged']);
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(movement.look(.4, .2), false);
    assert.equal(movement.yaw, startYaw);
    assert.equal(movement.pitch, startPitch);

    globalThis.document = fakeDocument(['input-mouse', 'inside', 'station-engaged']);
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(movement.look(.4, .2), true);
    assert.notEqual(movement.yaw, startYaw);
    assert.notEqual(movement.pitch, startPitch);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldMatchMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = oldMatchMedia;
  }
});
