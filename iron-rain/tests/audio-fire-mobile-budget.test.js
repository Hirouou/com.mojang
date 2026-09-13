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

test('cannon keeps the mobile transient graph to seven sources per shot', t => {
  const previous = globalThis.window;
  const contexts = [];
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
  const audio = createWarAudio();
  t.after(() => { audio.dispose(); globalThis.window = previous; });

  audio.wake();
  const ctx = contexts[0];
  const before = ctx.nodes.length;
  audio.fire();
  const shotSources = ctx.nodes.slice(before).filter(n => n.started && n.stopped !== undefined);

  assert.equal(shotSources.length, 7, 'one cannon shot must stay within the mobile transient voice budget');
  assert.ok(shotSources.some(n => n.kind === 'noise' && n.started[0] > ctx.currentTime), 'bounded delayed hull rattle remains audible');
  assert.ok(shotSources.some(n => n.kind === 'oscillator'), 'low-frequency cannon body remains present');
});