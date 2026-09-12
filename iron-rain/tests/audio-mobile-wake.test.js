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
    gain: new Param(), frequency: new Param(), threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(),
    connect() {}, disconnect() {}, start(...args) { this.started = args; }, stop() {},
  };
}

function installAudioContext(t, initialState = 'interrupted') {
  const previous = globalThis.window;
  let context;
  class AudioContext {
    state = initialState; currentTime = 0; sampleRate = 8000; destination = {};
    resumeCalls = 0; bufferSources = [];
    constructor() { context = this; }
    createGain() { return node('gain'); }
    createDynamicsCompressor() { return node('compressor'); }
    createOscillator() { return node('oscillator'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { const source = node('buffer-source'); this.bufferSources.push(source); return source; }
    createBuffer(channels, samples, sampleRate) {
      const data = new Float32Array(samples);
      return { duration: samples / sampleRate, getChannelData: () => data };
    }
    resume() {
      this.resumeCalls++;
      return new Promise(resolve => { this.finishResume = () => { this.state = 'running'; this.onstatechange?.(); resolve(); }; });
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext };
  t.after(() => { globalThis.window = previous; });
  return () => context;
}

test('mobile wake coalesces priming while an interrupted context is resuming', async t => {
  const getContext = installAudioContext(t);
  const audio = createWarAudio();
  t.after(() => audio.dispose());

  audio.wake();
  const context = getContext();
  assert.equal(context.resumeCalls, 1);
  assert.equal(context.bufferSources.length, 1, 'first wake primes the interrupted output path once');
  assert.ok(context.bufferSources[0].started, 'prime source starts from the user gesture');

  audio.wake(); audio.wake();
  assert.equal(context.resumeCalls, 1, 'pending resume promise is shared');
  assert.equal(context.bufferSources.length, 1, 'extra gestures do not allocate duplicate prime nodes while resume is pending');
  assert.equal(audio.getStatus().state, 'interrupted');

  context.finishResume();
  await Promise.resolve();
  assert.equal(audio.getStatus().state, 'running');
  assert.equal(audio.getStatus().ready, true);
});

test('passive frames do not occupy the Safari resume gate before the next operator gesture', async t => {
  const getContext = installAudioContext(t);
  const audio = createWarAudio();
  t.after(() => audio.dispose());

  audio.wake();
  const context = getContext();
  context.finishResume();
  await Promise.resolve();
  assert.equal(context.resumeCalls, 1);

  context.state = 'interrupted';
  audio.update({ time: 1, inside: true });
  audio.update({ time: 2, inside: true });
  assert.equal(context.resumeCalls, 1, 'animation frames never start autoplay-gated resume attempts');
  assert.equal(context.bufferSources.length, 1, 'passive frames do not allocate prime sources');

  audio.wake();
  assert.equal(context.resumeCalls, 2, 'the next explicit gesture owns the retry');
  assert.equal(context.bufferSources.length, 2, 'the gesture primes the interrupted output path');
});
