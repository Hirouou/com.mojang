import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarAudio } from '../modules/war-audio.js';

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'set', value, time }); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'linear', value, time }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'exponential', value, time }); }
  setTargetAtTime(value, time) { this.value = value; this.events.push({ kind: 'target', value, time }); }
}

function setup(t) {
  const previous = globalThis.window;
  const contexts = [];
  class AudioContext {
    state = 'running'; currentTime = 2; sampleRate = 8000; destination = {}; nodes = []; bufferAllocations = 0;
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
    createBuffer(channels, samples) { this.bufferAllocations++; return { getChannelData: () => new Float32Array(samples) }; }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext };
  const audio = createWarAudio();
  audio.wake();
  t.after(() => { audio.dispose(); globalThis.window = previous; });
  return { audio, ctx: contexts[0] };
}

function peakGain(nodes) {
  return Math.max(0, ...nodes.filter(node => node.kind === 'gain').flatMap(node => node.gain.events.filter(event => event.kind === 'linear').map(event => event.value)));
}

test('replicated hull impact keeps crack, low thump and internal rattle while scaling canonical feedback', t => {
  const { audio, ctx } = setup(t);
  const baseline = ctx.nodes.length;
  audio.impact({ intensity: .25, sharpCrack: .25, lowThump: .3, metalRattle: .2 });
  const lightNodes = ctx.nodes.slice(baseline);
  const lightSources = lightNodes.filter(node => node.started && node.stopped !== undefined);
  assert.equal(lightSources.length, 4, 'one impact stays a bounded four-voice transient');
  assert.ok(lightSources.some(node => node.kind === 'noise' && node.started[0] > ctx.currentTime), 'internal rattle is delayed');
  assert.ok(lightSources.some(node => node.kind === 'oscillator'), 'low transmitted body thump is present');
  const lightPeak = peakGain(lightNodes);

  const beforeHeavy = ctx.nodes.length;
  audio.impact({ intensity: 1, sharpCrack: 1, lowThump: 1, metalRattle: 1 });
  const heavyNodes = ctx.nodes.slice(beforeHeavy);
  assert.equal(heavyNodes.filter(node => node.started && node.stopped !== undefined).length, 4);
  assert.ok(peakGain(heavyNodes) > lightPeak, 'heavy canonical feedback produces a stronger hull response');
  assert.equal(ctx.bufferAllocations, 1, 'shared impacts reuse the procedural noise buffer');
});

test('impact feedback remains safe with missing or malformed replicated payloads', t => {
  const { audio, ctx } = setup(t);
  assert.doesNotThrow(() => audio.impact());
  assert.doesNotThrow(() => audio.impact({ intensity: NaN, sharpCrack: Infinity, lowThump: -4, metalRattle: 9 }));
  assert.equal(ctx.bufferAllocations, 1);
  assert.ok(ctx.nodes.filter(node => node.started && node.stopped !== undefined).length >= 8);
});
