import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarAudio } from '../modules/war-audio.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

function node(kind) {
  return {
    kind,
    gain: new Param(), frequency: new Param(), threshold: new Param(), knee: new Param(),
    ratio: new Param(), attack: new Param(), release: new Param(),
    connect() {}, disconnect() {},
    start(...args) { this.started = args; },
    stop(time) { this.stopped = time ?? 0; },
  };
}

test('hidden mobile document mutes the bus and blocks new transient voices', t => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const contexts = [];
  const listeners = new Map();

  class AudioContext {
    state = 'running'; currentTime = 1; sampleRate = 8000; destination = {}; nodes = [];
    constructor() { contexts.push(this); }
    createGain() { const n = node('gain'); this.nodes.push(n); return n; }
    createDynamicsCompressor() { const n = node('compressor'); this.nodes.push(n); return n; }
    createOscillator() { const n = node('oscillator'); this.nodes.push(n); return n; }
    createBiquadFilter() { const n = node('filter'); this.nodes.push(n); return n; }
    createBufferSource() { const n = node('noise'); this.nodes.push(n); return n; }
    createBuffer(_channels, samples) {
      const data = new Float32Array(samples);
      return { duration: samples / this.sampleRate, getChannelData: () => data };
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  globalThis.window = { AudioContext };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };

  const audio = createWarAudio();
  t.after(() => {
    audio.dispose();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  audio.wake();
  const ctx = contexts[0];
  const master = ctx.nodes.find(n => n.kind === 'gain');
  const beforeVisible = ctx.nodes.length;
  audio.radio();
  assert.ok(ctx.nodes.length > beforeVisible, 'visible document should still create audible transients');

  globalThis.document.visibilityState = 'hidden';
  listeners.get('visibilitychange')?.();
  assert.equal(master.gain.value, 0, 'backgrounding should mute the existing audio graph immediately');
  const beforeHidden = ctx.nodes.length;
  audio.fire();
  audio.impact();
  audio.radio();
  assert.equal(ctx.nodes.length, beforeHidden, 'hidden document must not allocate new transient Web Audio nodes');

  globalThis.document.visibilityState = 'visible';
  listeners.get('visibilitychange')?.();
  assert.equal(master.gain.value, .9, 'foregrounding restores the configured master level without recreating the graph');
  audio.radio();
  assert.ok(ctx.nodes.length > beforeHidden, 'foreground audio resumes using the existing graph');
  assert.equal(listeners.has('visibilitychange'), true, 'visibility listener remains active until dispose');
});
