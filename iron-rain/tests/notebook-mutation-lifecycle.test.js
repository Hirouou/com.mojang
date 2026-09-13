import test from 'node:test';
import assert from 'node:assert/strict';
import { installNotebookBridge } from '../modules/strategic-war-live-v3.js';

test('notebook location mutations settle, then update when the Mamute moves', () => {
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  let pending = false, callback, chip = null, disconnected = false, writes = 0;
  const own = { textContent: 'X 8200 Y 30000' };
  const title = {
    querySelector: () => chip,
    appendChild: node => { chip = node; pending = true; },
  };
  const notebook = { querySelector: () => title };
  globalThis.document = {
    getElementById: id => id === 'notebook' ? notebook : own,
    createElement: () => ({
      value: '',
      get textContent() { return this.value; },
      set textContent(value) { this.value = value; writes++; pending = true; },
    }),
  };
  globalThis.MutationObserver = class {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const flush = () => {
    let iterations = 0;
    while (pending) {
      assert.ok(++iterations < 20, 'observer must not recursively rewrite its own label');
      pending = false;
      callback();
    }
  };
  try {
    const dispose = installNotebookBridge(position => ({
      hex: { name: position.x < 9000 ? 'WEST' : 'EAST' }, sector: { name: 'BASE' },
    }));
    flush();
    assert.equal(writes, 1);
    assert.equal(chip.textContent, 'TEATRO: WEST / BASE');
    own.textContent = 'X 10000 Y 30000';
    pending = true;
    flush();
    assert.equal(writes, 2);
    assert.equal(chip.textContent, 'TEATRO: EAST / BASE');
    dispose();
    assert.equal(disconnected, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.MutationObserver = previousObserver;
  }
});
