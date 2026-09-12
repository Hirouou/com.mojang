import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarAudio } from '../modules/war-audio.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

function fixture(t) {
  const previous = globalThis.window;
  const contexts = [];
  class AudioContext {
    state = 'running'; currentTime = 1; sampleRate = 8000; destination = {};
    nodes = []; bufferAllocations = 0;
    constructor() { contexts.push(this); }
    node(kind) {
      const node = {
        kind, gain: new Param(), frequency: new Param(), threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(),
        connect() {}, disconnect() { this.disconnected = true; },
        start(...args) { this.started = args; }, stop(time) { this.stopped = time ?? 0; },
      };
      this.nodes.push(node); return node;
    }
    createGain() { return this.node('gain'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createOscillator() { return this.node('oscillator'); }
    createBiquadFilter() { return this.node('filter'); }
    createBufferSource() { return this.node('noise'); }
    createBuffer(_channels, samples) {
      this.bufferAllocations++;
      const data = new Float32Array(samples);
      return { duration: samples / this.sampleRate, getChannelData: () => data };
    }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext };
  const audio = createWarAudio();
  t.after(() => { audio.dispose(); globalThis.window = previous; });
  return { audio, contexts };
}

test('loader phase contact stays compact and reuses the shared noise buffer', t => {
  const { audio, contexts } = fixture(t);
  audio.wake();
  const ctx = contexts[0], base = ctx.nodes.length;

  audio.load();
  const first = ctx.nodes.slice(base).filter(node => node.started && node.stopped !== undefined);
  assert.equal(first.length, 2, 'one loader transition creates one noise contact plus one low mechanical tone');
  assert.ok(first.every(node => node.stopped <= ctx.currentTime + .14), 'loader contact stays short instead of replaying a long sequence');

  const afterFirst = ctx.nodes.length;
  audio.load();
  const second = ctx.nodes.slice(afterFirst).filter(node => node.started && node.stopped !== undefined);
  assert.equal(second.length, 2, 'the next mechanical phase adds only one compact contact again');
  assert.equal(ctx.bufferAllocations, 1, 'repeated loader phases reuse the existing procedural noise buffer');
});
