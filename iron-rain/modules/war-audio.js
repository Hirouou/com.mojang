/** Procedural soundscape. Audio is created only after an operator gesture. */
export function createWarAudio() {
  const levels = { master: .9, effects: 1, ambient: .75 };
  const voices = new Set();
  const MAX_VOICES = 40;
  let context, master, effectsBus, ambientBus, engine, engineFilter, noiseBuffer;
  let muted = false, paused = false, nextFoot = 0, nextCrank = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
  // Device loss or denied playback must never escape into the game loop.
  const safely = fn => { try { return fn(); } catch { return undefined; } };
  const settle = result => result?.catch?.(() => {});

  function applyVolumes() {
    if (!context || !master) return;
    const t = context.currentTime;
    master.gain.setTargetAtTime(muted || paused ? 0 : levels.master, t, .025);
    effectsBus.gain.setTargetAtTime(levels.effects, t, .025);
    ambientBus.gain.setTargetAtTime(levels.ambient, t, .08);
  }

  function wake() {
    if (muted) return;
    safely(() => {
      if (context?.state === 'closed') clearContext();
      if (!context) {
        const Audio = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
        if (!Audio) return;
        try {
          context = new Audio();
          master = context.createGain();
          effectsBus = context.createGain();
          ambientBus = context.createGain();
          // Control overlapping explosions without losing the initial crack.
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -10; limiter.knee.value = 10;
          limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .24;
          master.gain.value = muted || paused ? 0 : levels.master;
          effectsBus.gain.value = levels.effects; ambientBus.gain.value = levels.ambient;
          effectsBus.connect(master); ambientBus.connect(master);
          master.connect(limiter); limiter.connect(context.destination);

          engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 39;
          engineFilter = context.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 130;
          const engineGain = context.createGain(); engineGain.gain.value = .065;
          engine.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(ambientBus); engine.start();

          // Reuse samples instead of allocating arrays on every crank movement.
          noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 3), context.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        } catch {
          settle(safely(() => context?.close()));
          clearContext();
          return;
        }
      }
      if (context.state === 'suspended') settle(context.resume());
    });
  }

  function canPlay() {
    return context?.state === 'running' && effectsBus && !muted && !paused && levels.master > 0 && levels.effects > 0;
  }

  function track(source, nodes, stopTime) {
    // Bound the graph even if an old browser delays onended.
    if (voices.size >= MAX_VOICES) {
      const oldest = voices.values().next().value;
      safely(() => oldest.source.stop()); oldest.cleanup();
    }
    const voice = { source, cleanup() {
      for (const node of nodes) safely(() => node.disconnect());
      voices.delete(voice);
    } };
    voices.add(voice); source.onended = voice.cleanup;
    try { source.stop(stopTime); } catch { voice.cleanup(); }
  }

  function envelope(gain, at, duration, amount) {
    gain.setValueAtTime(.0001, at);
    gain.linearRampToValueAtTime(amount, at + Math.min(.006, duration / 8));
    gain.exponentialRampToValueAtTime(.0001, at + duration);
  }

  function noise(duration, volume, frequency, { delay = 0, type = 'lowpass', endFrequency = frequency } = {}) {
    if (!canPlay() || volume <= 0) return;
    const at = context.currentTime + delay;
    const source = context.createBufferSource(); source.buffer = noiseBuffer;
    const eq = context.createBiquadFilter(); eq.type = type;
    eq.frequency.setValueAtTime(frequency, at);
    eq.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    const gain = context.createGain(); envelope(gain.gain, at, duration, volume);
    source.connect(eq); eq.connect(gain); gain.connect(effectsBus);
    source.start(at, Math.random() * Math.max(0, 3 - duration - .03));
    track(source, [source, eq, gain], at + duration + .02);
  }

  function tone(duration, volume, frequency, endFrequency, delay = 0, type = 'sine') {
    if (!canPlay() || volume <= 0) return;
    const at = context.currentTime + delay;
    const source = context.createOscillator(); source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    const gain = context.createGain(); envelope(gain.gain, at, duration, volume);
    source.connect(gain); gain.connect(effectsBus); source.start(at);
    track(source, [source, gain], at + duration + .02);
  }

  function clearContext() {
    for (const voice of [...voices]) voice.cleanup();
    context = master = effectsBus = ambientBus = engine = engineFilter = noiseBuffer = null;
    nextCrank = 0;
  }

  function getVolumes() { return { ...levels, muted }; }
  function setVolumes(next = {}) {
    if (next.master !== undefined) levels.master = clamp(Number(next.master), 0, 1);
    if (next.effects !== undefined) levels.effects = clamp(Number(next.effects), 0, 1.5);
    if (next.ambient !== undefined) levels.ambient = clamp(Number(next.ambient), 0, 1);
    safely(applyVolumes);
    return getVolumes();
  }

  return {
    wake, setVolumes, getVolumes,
    toggle() {
      muted = !muted;
      if (!muted) wake();
      safely(applyVolumes);
      return !muted;
    },
    update({ time = 0, moving = false, inside = true, speed = 0, paused: isPaused = false } = {}) {
      paused = Boolean(isPaused);
      safely(() => {
        applyVolumes();
        if (engine && context) {
          engine.frequency.setTargetAtTime(inside ? 38 : 40 + clamp(speed, 0, 100) * .12, context.currentTime, .4);
          engineFilter.frequency.setTargetAtTime(inside ? 130 : 85, context.currentTime, .4);
        }
        if (moving && inside && time > nextFoot && !paused) {
          noise(.14, .28, 650); tone(.1, .1, 150, 70);
          nextFoot = time + .43;
        }
      });
    },
    crank() { safely(() => {
      if (!canPlay() || context.currentTime < nextCrank) return;
      nextCrank = context.currentTime + .045;
      noise(.09, .19, 2400, { type: 'bandpass', endFrequency: 950 });
      tone(.07, .055, 340, 220, 0, 'triangle');
    }); },
    load() { safely(() => {
      noise(.48, .42, 1500, { endFrequency: 460 });
      for (const delay of [0, .19, .41]) {
        noise(.09, .37, 2700, { delay, type: 'bandpass' });
        tone(.11, .15, 230, 90, delay, 'triangle');
      }
    }); },
    fire() { safely(() => {
      // Crack, pressure, hull rattles and a broad tail also read on small speakers.
      noise(.16, 1.25, 6200, { endFrequency: 1300 });
      noise(1.65, 1.1, 1050, { endFrequency: 110 });
      tone(1.3, 1.1, 125, 43);
      tone(.36, .3, 290, 100, .025, 'triangle');
      noise(2.65, .55, 700, { delay: .12, endFrequency: 160 });
      for (const delay of [.07, .16, .3, .48]) noise(.18, .24, 1900, { delay, type: 'bandpass', endFrequency: 600 });
    }); },
    impact() { safely(() => {
      noise(.22, .78, 3600, { endFrequency: 650 });
      noise(1.45, .75, 720, { endFrequency: 95 });
      tone(.9, .6, 105, 37);
      noise(.55, .25, 2100, { delay: .1, type: 'bandpass', endFrequency: 550 });
    }); },
    radio() { safely(() => {
      noise(.18, .2, 2200, { type: 'bandpass' });
      tone(.055, .095, 1200, 1170, .02);
    }); },
    dispose() {
      safely(() => { for (const voice of [...voices]) safely(() => voice.source.stop()); });
      settle(safely(() => context?.close()));
      clearContext(); nextCrank = nextFoot = 0;
    },
  };
}
