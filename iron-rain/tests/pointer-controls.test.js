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
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...values,
    };
    for (const handler of [...(this.listeners.get(name) ?? [])]) handler(event);
    if (!event.stopped && this.ownerDocument?.defaultView && name.startsWith('pointer')) {
      for (const handler of [...(this.ownerDocument.defaultView.listeners.get(name) ?? [])]) handler(event);
    }
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
  element.captured = new Set();
  element.setPointerCapture = id => element.captured.add(id);
  element.hasPointerCapture = id => element.captured.has(id);
  element.releasePointerCapture = id => {
    element.captured.delete(id);
    element.fire('lostpointercapture', { pointerId: id });
  };
  return { view, doc, element, visual: new Surface() };
}

const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} ≠ ${expected}`);

test('joystick captures a pointer, stays normalized and ignores a second finger', () => {
  const { element, visual } = setup();
  const changes = [];
  let engagements = 0;
  bindJoystick(element, visual, { onChange: value => changes.push(value), onEngage: () => engagements++ });
  const down = element.fire('pointerdown');
  assert.ok(down.prevented && down.stopped);
  assert.equal(element.style.touchAction, 'none');
  assert.ok(element.captured.has(1));
  assert.deepEqual(changes.at(-1), { x: 1, y: 0 });
  element.fire('pointerdown', { pointerId: 2, clientX: 0 });
  element.fire('pointermove', { pointerId: 2, clientX: 0 });
  element.fire('pointerup', { pointerId: 2 });
  assert.equal(engagements, 1);
  assert.deepEqual(changes.at(-1), { x: 1, y: 0 });
  element.fire('pointermove', { clientX: 1000, clientY: -1000 });
  close(Math.hypot(changes.at(-1).x, changes.at(-1).y), 1);
  element.fire('pointerup');
  assert.deepEqual(changes.at(-1), { x: 0, y: 0 });
  assert.equal(element.captured.size, 0);
});

test('joystick centre dead zone prevents creeping and reports release only once', () => {
  const { element, visual } = setup();
  const changes = [];
  bindJoystick(element, visual, { onChange: value => changes.push(value) });
  element.fire('pointerdown', { clientX: 52, clientY: 51 });
  close(changes.at(-1).x, 0); close(changes.at(-1).y, 0);
  element.fire('pointermove');
  const before = changes.length;
  element.fire('pointerup');
  assert.equal(changes.length, before + 1);
  assert.deepEqual(changes.at(-1), { x: 0, y: 0 });
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
  test(`joystick returns to neutral on ${interruption}, then accepts a fresh pointer`, () => {
    const { view, doc, element, visual } = setup();
    let current;
    bindJoystick(element, visual, { onChange: value => { current = value; } });
    element.fire('pointerdown');
    if (interruption === 'blur') view.fire('blur');
    else if (interruption === 'visibilitychange') { doc.hidden = true; doc.fire('visibilitychange'); }
    else element.fire(interruption);
    assert.deepEqual(current, { x: 0, y: 0 });
    assert.equal(element.captured.size, 0);
    element.fire('pointermove');
    assert.deepEqual(current, { x: 0, y: 0 });
    element.fire('pointerdown', { pointerId: 3 });
    assert.deepEqual(current, { x: 1, y: 0 });
  });
}

test('disabled controls cancel active gestures, and dispose removes all event handlers', () => {
  const { view, doc, element, visual } = setup();
  let enabled = false;
  let current;
  element.style.touchAction = 'pan-x';
  const control = bindJoystick(element, visual, { isEnabled: () => enabled, onChange: value => { current = value; } });
  element.fire('pointerdown');
  assert.equal(current, undefined);
  enabled = true;
  element.fire('pointerdown');
  enabled = false;
  element.fire('pointermove');
  assert.deepEqual(current, { x: 0, y: 0 });
  control.dispose();
  control.dispose();
  assert.equal(element.style.touchAction, 'pan-x');
  for (const target of [view, doc, element]) for (const handlers of target.listeners.values()) assert.equal(handlers.size, 0);
});

test('failed pointer capture still drags and releases through the window fallback', () => {
  const { view, element, visual } = setup();
  let current;
  element.setPointerCapture = () => { throw new Error('capture unavailable'); };
  bindJoystick(element, visual, { onChange: value => { current = value; } });
  element.fire('pointerdown');
  view.fire('pointermove', { clientX: -50 });
  assert.deepEqual(current, { x: -1, y: 0 });
  view.fire('pointerup');
  assert.deepEqual(current, { x: 0, y: 0 });
});

test('handwheel reduces rotation, crosses ±180 smoothly and guards secondary pointers', () => {
  const { element, visual } = setup();
  const deltas = [];
  bindHandwheel(element, visual, { reduction: 1 / 6, onDelta: degrees => deltas.push(degrees) });
  const point = degrees => ({ clientX: 50 + 40 * Math.cos(degrees * Math.PI / 180), clientY: 50 + 40 * Math.sin(degrees * Math.PI / 180) });
  element.fire('pointerdown', point(170));
  element.fire('pointerdown', { ...point(0), pointerId: 2 });
  element.fire('pointermove', { ...point(90), pointerId: 2 });
  assert.equal(deltas.length, 0);
  element.fire('pointermove', point(-170));
  close(deltas.at(-1), 20 / 6);
  element.fire('pointermove', point(-80));
  close(deltas.at(-1), 15);
  assert.match(visual.style.transform, /^rotate\(/);
});

test('crossing the handwheel centre does not turn the cannon suddenly', () => {
  const { element, visual } = setup();
  const deltas = [];
  bindHandwheel(element, visual, { reduction: 0.2, onDelta: degrees => deltas.push(degrees) });
  element.fire('pointerdown');
  element.fire('pointermove', { clientX: 50, clientY: 50 });
  element.fire('pointermove', { clientX: 0, clientY: 50 });
  assert.equal(deltas.length, 0);
  element.fire('pointermove', { clientX: 50, clientY: 0 });
  close(deltas.at(-1), 18);
});

for (const interruption of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
  test(`handwheel forgets angular origin on ${interruption}`, () => {
    const { view, element, visual } = setup();
    const deltas = [];
    bindHandwheel(element, visual, { onDelta: degrees => deltas.push(degrees) });
    element.fire('pointerdown');
    if (interruption === 'blur') view.fire('blur'); else element.fire(interruption);
    element.fire('pointermove', { clientX: 50, clientY: 100 });
    assert.equal(deltas.length, 0);
    element.fire('pointerdown', { pointerId: 3, clientX: 50, clientY: 100 });
    element.fire('pointermove', { pointerId: 3, clientX: 0, clientY: 50 });
    close(deltas.at(-1), 16.2);
  });
}

test('non-primary touch can operate another control while a first touch remains active', () => {
  const first = setup();
  const second = setup();
  let joystick;
  let rotation;
  bindJoystick(first.element, first.visual, { onChange: value => { joystick = value; } });
  bindHandwheel(second.element, second.visual, { onDelta: value => { rotation = value; } });
  first.element.fire('pointerdown', { pointerId: 1, isPrimary: true });
  second.element.fire('pointerdown', { pointerId: 2, isPrimary: false });
  second.element.fire('pointermove', { pointerId: 2, isPrimary: false, clientX: 50, clientY: 100 });
  assert.deepEqual(joystick, { x: 1, y: 0 });
  close(rotation, 16.2);
});
