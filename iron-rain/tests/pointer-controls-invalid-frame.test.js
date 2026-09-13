import test from 'node:test';
import assert from 'node:assert/strict';
import { bindJoystick, bindHandwheel } from '../modules/pointer-controls.js';

class Surface {
  constructor() { this.listeners = new Map(); this.style = {}; }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(handler);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  fire(name, values = {}) {
    const event = {
      pointerId: 1, button: 0, clientX: 100, clientY: 50, target: this,
      preventDefault() {}, stopPropagation() {}, ...values,
    };
    for (const handler of [...(this.listeners.get(name) ?? [])]) handler(event);
    return event;
  }
}

function setup() {
  const view = new Surface();
  const doc = new Surface();
  doc.defaultView = view;
  doc.hidden = false;
  const element = new Surface();
  element.ownerDocument = doc;
  element.bounds = { left: 0, top: 0, width: 100, height: 100 };
  element.getBoundingClientRect = () => element.bounds;
  element.setPointerCapture = () => {};
  element.hasPointerCapture = () => true;
  element.releasePointerCapture = () => {};
  return { element, visual: new Surface() };
}

test('joystick fails closed when the browser reports a non-finite pointer frame', () => {
  const { element, visual } = setup();
  const changes = [];
  bindJoystick(element, visual, { onChange: value => changes.push(value) });
  element.fire('pointerdown');
  assert.deepEqual(changes.at(-1), { x: 1, y: 0 });

  for (const malformed of [
    { clientX: NaN },
    { clientY: Infinity },
    { clientX: -Infinity },
  ]) {
    element.fire('pointermove', malformed);
    assert.deepEqual(changes.at(-1), { x: 0, y: 0 });
    assert.equal(visual.style.transform, 'translate(0px, 0px)');
  }
});

test('zero or non-finite joystick geometry reports neutral instead of NaN movement', () => {
  const { element, visual } = setup();
  let current;
  bindJoystick(element, visual, { onChange: value => { current = value; } });

  for (const bounds of [
    { left: 0, top: 0, width: 0, height: 100 },
    { left: 0, top: 0, width: Infinity, height: 100 },
  ]) {
    element.bounds = bounds;
    element.fire('pointerdown');
    assert.deepEqual(current, { x: 0, y: 0 });
    element.fire('pointerup');
  }
});

test('handwheel ignores malformed coordinates and resumes from a fresh angular origin', () => {
  const { element, visual } = setup();
  const deltas = [];
  bindHandwheel(element, visual, { reduction: 1, onDelta: value => deltas.push(value) });

  element.fire('pointerdown', { clientX: 90, clientY: 50 });
  element.fire('pointermove', { clientX: Infinity, clientY: 50 });
  element.fire('pointermove', { clientX: 50, clientY: 90 });
  assert.equal(deltas.length, 0, 'invalid sample must clear the angular origin');

  element.fire('pointermove', { clientX: 10, clientY: 50 });
  assert.equal(deltas.length, 1);
  assert.ok(Number.isFinite(deltas[0]));
  assert.doesNotMatch(visual.style.transform, /NaN|Infinity/);
});
