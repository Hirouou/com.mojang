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
    connect() {}, disconnect() { this.disconnected = true; },
    start(...args) { this.started = args; },
    stop(time) { this.stopped = time ?? 0; },
  };
}

test('pagehide drains transient voices and pageshow reuses the existing audio graph', t => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousAdd = globalThis.addEventListener;
  const previousRemove = globalThis.removeEventListener;
  const contexts = [];
  const pageListeners = new Map();
  const documentListeners = new Map();

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
  globalThis.addEventListener = (type, listener) => pageListeners.set(type, listener);
  globalThis.removeEventListener = (type, listener) => {
    if (pageListeners.get(type) === listener) pageListeners.delete(type);
  };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) { if (documentListeners.get(type) === listener) documentListeners.delete(type); },
  };

  const audio = createWarAudio();
  t.after(() => {
    audio.dispose();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.addEventListener = previousAdd;
    globalThis.removeEventListener = previousRemove;
  });

  audio.wake();
  const ctx = contexts[0];
  const master = ctx.nodes.find(n => n.kind === 'gain');
  audio.fire();
  const liveTransients = ctx.nodes.filter(n => (n.kind === 'noise' || n.kind === 'oscillator') && n.started);
  assert.ok(liveTransients.length > 0, 'foreground fire should allocate transient voices');

  pageListeners.get('pagehide')?.();
  assert.equal(master.gain.value, 0, 'pagehide should mute the master even when visibilityState has not changed');
  assert.ok(liveTransients.every(n => n.stopped !== undefined), 'pagehide should stop already active transient sources');
  const afterHide = ctx.nodes.length;
  audio.radio();
  audio.impact();
  assert.equal(ctx.nodes.length, afterHide, 'pagehide should block new transient allocations');

  pageListeners.get('pageshow')?.();
  assert.equal(master.gain.value, .9, 'pageshow restores the configured master without recreating AudioContext');
  audio.radio();
  assert.ok(ctx.nodes.length > afterHide, 'foreground playback resumes on the existing graph');
  assert.equal(contexts.length, 1, 'page lifecycle should not allocate a second AudioContext');
  assert.equal(pageListeners.has('pagehide'), true);
  assert.equal(pageListeners.has('pageshow'), true);
});
