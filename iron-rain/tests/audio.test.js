import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarAudio } from '../modules/war-audio.js';

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) {
    assert.ok(value > 0, 'exponential ramps must never target zero');
    this.record('exponential', value, time);
  }
  setTargetAtTime(value, time, constant) {
    assert.ok(constant > 0);
    this.record('target', value, time);
  }
  record(kind, value, time) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time));
    this.value = value; this.events.push({ kind, value, time });
  }
}

function fixture(t) {
  const previous = globalThis.window;
  const contexts = [];
  class AudioContext {
    state = 'running'; currentTime = 1; sampleRate = 8000;
    nodes = []; destination = {}; bufferAllocations = 0;
    constructor() { contexts.push(this); }
    node(kind) {
      if (this.failNode) throw new Error('Audio device unavailable');
      const node = {
        kind, connections: [], gain: new Param(), frequency: new Param(),
        threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(),
        connect(target) { this.connections.push(target); },
        disconnect() { this.connections = []; this.disconnected = true; },
        start(...args) { this.started = args; },
        stop(time) { this.stopped = time ?? 0; },
      };
      this.nodes.push(node); return node;
    }
    createGain() { return this.node('gain'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createOscillator() { return this.node('oscillator'); }
    createBiquadFilter() { return this.node('filter'); }
    createBufferSource() { return this.node('noise'); }
    createBuffer(channels, samples) {
      this.bufferAllocations++;
      const data = new Float32Array(samples);
      return { getChannelData: () => data };
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext };
  const audio = createWarAudio();
  t.after(() => { audio.dispose(); globalThis.window = previous; });
  return { audio, contexts, AudioContext };
}

test('audio waits for a gesture and preserves independent volume settings', t => {
  const { audio, contexts } = fixture(t);
  audio.fire(); audio.update({ moving: true, inside: true, time: 10 });
  assert.equal(contexts.length, 0);
  assert.deepEqual(audio.getVolumes(), { master: .9, effects: 1, ambient: .75, muted: false });
  audio.setVolumes({ master: .6, effects: .4, ambient: .2 }); audio.wake();
  const [master, effects, ambient] = contexts[0].nodes.filter(n => n.kind === 'gain');
  assert.deepEqual([master.gain.value, effects.gain.value, ambient.gain.value], [.6, .4, .2]);
  audio.fire(); const count = contexts[0].nodes.length;
  audio.setVolumes({ effects: 0 });
  assert.equal(effects.gain.value, 0, 'the bus silences already playing effects');
  assert.equal(ambient.gain.value, .2, 'ambient is independent from effects');
  audio.fire(); audio.load(); audio.radio(); audio.crank();
  assert.equal(contexts[0].nodes.length, count, 'zero effects volume creates no hidden voices');
});

test('mute, pause and zero master remain silent through volume changes', t => {
  const { audio, contexts } = fixture(t); audio.wake();
  const ctx = contexts[0], master = ctx.nodes[0];
  assert.equal(audio.toggle(), false);
  audio.setVolumes({ master: 1 });
  assert.equal(master.gain.value, 0);
  assert.equal(audio.toggle(), true); assert.equal(master.gain.value, 1);
  audio.update({ paused: true }); audio.setVolumes({ effects: .5 });
  assert.equal(master.gain.value, 0, 'moving a slider cannot unpause audio');
  const count = ctx.nodes.length; audio.fire(); assert.equal(ctx.nodes.length, count);
  audio.update({ paused: false }); assert.equal(master.gain.value, 1);
  audio.setVolumes({ master: 0 }); audio.fire(); assert.equal(ctx.nodes.length, count);
});

test('cannon combines transient, bass and hull rattle with bounded, cleaned-up voices', t => {
  const { audio, contexts } = fixture(t); audio.wake(); audio.fire();
  const ctx = contexts[0];
  const sources = ctx.nodes.filter(n => n.started && n.stopped !== undefined);
  assert.ok(sources.some(n => n.kind === 'oscillator'));
  assert.ok(sources.some(n => n.kind === 'noise'));
  assert.ok(sources.some(n => n.started[0] > ctx.currentTime), 'delayed hull rattles');
  assert.ok(sources.every(n => Number.isFinite(n.stopped) && n.stopped > n.started[0] && n.stopped < ctx.currentTime + 3));
  const master = ctx.nodes[0], compressor = ctx.nodes.find(n => n.kind === 'compressor');
  assert.ok(master.connections.includes(compressor));
  assert.ok(compressor.connections.includes(ctx.destination));
  assert.ok(compressor.ratio.value > 1);
  for (let i = 0; i < 25; i++) audio.fire();
  assert.equal(ctx.bufferAllocations, 1, 'repeated blasts reuse the sample buffer');
  assert.ok(ctx.nodes.filter(n => n.started && !n.disconnected).length <= 41, 'bounded effects plus engine');
  for (const node of ctx.nodes.filter(n => n.onended)) node.onended();
  assert.equal(ctx.nodes.filter(n => n.started && n.stopped !== undefined && !n.disconnected).length, 0);
});

test('audio failures and closed contexts never break gameplay and can recover', async t => {
  const { audio, contexts } = fixture(t); audio.wake();
  const ctx = contexts[0]; ctx.failNode = true;
  for (const method of ['fire', 'impact', 'load', 'radio', 'crank']) assert.doesNotThrow(() => audio[method]());
  ctx.nodes[0].gain.setTargetAtTime = () => { throw new Error('device lost'); };
  assert.doesNotThrow(() => audio.update({ moving: true, time: 100 }));
  assert.doesNotThrow(() => audio.setVolumes({ master: .5 }));
  ctx.close(); audio.wake(); assert.equal(contexts.length, 2);
  assert.doesNotThrow(() => audio.fire());
  contexts[1].state = 'suspended';
  contexts[1].resume = () => Promise.reject(new Error('gesture required'));
  audio.wake(); await Promise.resolve();
  assert.doesNotThrow(() => audio.dispose());
});

test('invalid volume inputs clamp and unavailable Web Audio remains optional', t => {
  const { audio } = fixture(t);
  assert.deepEqual(audio.setVolumes({ master: 7, effects: -1, ambient: NaN }), { master: 1, effects: 0, ambient: 0, muted: false });
  globalThis.window = {};
  assert.doesNotThrow(() => { audio.wake(); audio.fire(); audio.update(); audio.toggle(); audio.toggle(); });
});

test('a failed audio setup is closed and can retry after the device returns', t => {
  const { audio, contexts, AudioContext } = fixture(t);
  globalThis.window.AudioContext = class extends AudioContext {
    createDynamicsCompressor() { throw new Error('device unavailable'); }
  };
  assert.doesNotThrow(() => audio.wake());
  assert.equal(contexts[0].state, 'closed');
  globalThis.window.AudioContext = AudioContext;
  audio.wake(); audio.fire();
  assert.equal(contexts.length, 2);
  assert.ok(contexts[1].nodes.some(n => n.kind === 'noise' && n.started));
});
