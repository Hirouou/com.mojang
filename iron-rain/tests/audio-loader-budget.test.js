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

function makeNode(kind) {
  return {
    kind,
    gain: new Param(), frequency: new Param(), threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(),
    connect() {}, disconnect() {}, start() {}, stop() {},
  };
}

function installRunningAudioContext(t) {
  const previous = globalThis.window;
  let context;
  class AudioContext {
    state = 'running'; currentTime = 0; sampleRate = 8000; destination = {};
    bufferSources = 0; oscillators = 0;
    constructor() { context = this; }
    createGain() { return makeNode('gain'); }
    createDynamicsCompressor() { return makeNode('compressor'); }
    createOscillator() { this.oscillators++; return makeNode('oscillator'); }
    createBiquadFilter() { return makeNode('filter'); }
    createBufferSource() { this.bufferSources++; return makeNode('buffer-source'); }
    createBuffer(channels, samples, sampleRate) {
      const data = new Float32Array(samples);
      return { duration: samples / sampleRate, getChannelData: () => data };
    }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext };
  t.after(() => { globalThis.window = previous; });
  return () => context;
}

test('loader phase feedback stays inside the compact mobile transient budget', t => {
  const getContext = installRunningAudioContext(t);
  const audio = createWarAudio();
  t.after(() => audio.dispose());

  audio.wake();
  const context = getContext();
  const baseBuffers = context.bufferSources;
  const baseOscillators = context.oscillators;

  audio.load();
  assert.equal(context.bufferSources - baseBuffers, 1, 'one loader contact allocates one noise source');
  assert.equal(context.oscillators - baseOscillators, 1, 'one loader contact allocates one tone source');

  for (let i = 0; i < 3; i++) audio.load();
  assert.equal(context.bufferSources - baseBuffers, 4, 'four phase contacts stay at four noise voices total');
  assert.equal(context.oscillators - baseOscillators, 4, 'four phase contacts stay at four tone voices total');
});
