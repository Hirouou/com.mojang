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

test('visibilitychange hidden drains transient voices without rebuilding the audio graph', t => {
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
  const beforeFire = ctx.nodes.length;
  audio.fire();
  const liveTransients = ctx.nodes.slice(beforeFire).filter(n => (n.kind === 'noise' || n.kind === 'oscillator') && n.started);
  assert.ok(liveTransients.length > 0, 'foreground fire should allocate transient voices');

  globalThis.document.visibilityState = 'hidden';
  listeners.get('visibilitychange')?.();
  assert.equal(master.gain.value, 0, 'hidden document should mute the existing graph immediately');
  assert.ok(liveTransients.every(n => n.stopped !== undefined && n.disconnected === true), 'hidden document should stop and disconnect active transient sources');
  const afterHide = ctx.nodes.length;
  audio.radio();
  audio.impact();
  assert.equal(ctx.nodes.length, afterHide, 'hidden document should not allocate replacement transient nodes');

  globalThis.document.visibilityState = 'visible';
  listeners.get('visibilitychange')?.();
  assert.equal(master.gain.value, .9, 'foregrounding should restore the configured master on the same graph');
  audio.radio();
  assert.ok(ctx.nodes.length > afterHide, 'foreground audio should resume on the existing graph');
  assert.equal(contexts.length, 1, 'visibility lifecycle must not allocate a second AudioContext');
});