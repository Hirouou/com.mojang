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
    connect() {}, disconnect() {}, start() {}, stop() {},
  };
}

test('first operator gesture resumes an interrupted mobile AudioContext without rebuilding it', async t => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const contexts = [];
  const listeners = new Map();

  class AudioContext {
    state = 'running'; currentTime = 1; sampleRate = 8000; destination = {}; resumeCalls = 0;
    constructor() { contexts.push(this); }
    createGain() { return node('gain'); }
    createDynamicsCompressor() { return node('compressor'); }
    createOscillator() { return node('oscillator'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('noise'); }
    createBuffer(_channels, samples) {
      const data = new Float32Array(samples);
      return { duration: samples / this.sampleRate, getChannelData: () => data };
    }
    resume() {
      this.resumeCalls += 1;
      this.state = 'running';
      return Promise.resolve();
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
  assert.equal(contexts.length, 1);
  assert.equal(ctx.resumeCalls, 0);

  ctx.state = 'interrupted';
  listeners.get('pointerdown')?.({ pointerType: 'touch' });
  await Promise.resolve();
  assert.equal(ctx.resumeCalls, 1, 'a real foreground gesture should resume interrupted Safari/iOS audio');
  assert.equal(ctx.state, 'running');
  assert.equal(contexts.length, 1, 'resume must reuse the existing graph and context');

  listeners.get('keydown')?.({ key: ' ' });
  await Promise.resolve();
  assert.equal(ctx.resumeCalls, 1, 'already-running audio should not issue redundant resume calls');
});

test('hidden-page gestures never attempt autoplay recovery', async t => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const contexts = [];
  const listeners = new Map();

  class AudioContext {
    state = 'running'; currentTime = 1; sampleRate = 8000; destination = {}; resumeCalls = 0;
    constructor() { contexts.push(this); }
    createGain() { return node('gain'); }
    createDynamicsCompressor() { return node('compressor'); }
    createOscillator() { return node('oscillator'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('noise'); }
    createBuffer(_channels, samples) {
      const data = new Float32Array(samples);
      return { duration: samples / this.sampleRate, getChannelData: () => data };
    }
    resume() { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
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
  assert.equal(contexts.length, 1);
  assert.equal(ctx.state, 'running');

  ctx.state = 'interrupted';
  globalThis.document.visibilityState = 'hidden';
  listeners.get('pointerdown')?.({ pointerType: 'touch' });
  await Promise.resolve();
  assert.equal(ctx.resumeCalls, 0, 'hidden pages must not attempt gesture-based autoplay recovery');
  assert.equal(ctx.state, 'interrupted');
  assert.equal(contexts.length, 1, 'hidden gestures must not rebuild the audio context');
});
