import { maintenanceEffectCadence } from './maintenance-effect-cadence.js';

/** Procedural soundscape. Audio is created only after an operator gesture. */
export function createWarAudio() {
  const levels = { master: .9, effects: 1, ambient: .75 };
  const voices = new Set();
  const MAX_VOICES = 40;
  let context, master, effectsBus, ambientBus, engine, engineFilter, engineGain, noiseBuffer;
  let muted = false, paused = false, nextFoot = 0, nextCrank = 0, resumePending = null, maintenanceState = null;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
  // Device loss or denied playback must never escape into the game loop.
  const safely = fn => { try { return fn(); } catch { return undefined; } };
  const settle = result => result?.catch?.(() => {});
  const documentHidden = () => globalThis.document?.visibilityState === 'hidden';

  function applyVolumes() {
    if (!context || !master) return;
    const t = context.currentTime;
    master.gain.setTargetAtTime(muted || paused || documentHidden() ? 0 : levels.master, t, .025);
    effectsBus.gain.setTargetAtTime(levels.effects, t, .025);
    ambientBus.gain.setTargetAtTime(levels.ambient, t, .08);
  }

  // Safari/iOS can expose `interrupted` in addition to the standard
  // `suspended`. A tiny already-allocated buffer source started from the same
  // user gesture primes the output path without adding a second sample buffer.
  function primeMobileOutput() {
    if (!context || !noiseBuffer || context.state === 'running') return;
    safely(() => {
      const source = context.createBufferSource();
      const silent = context.createGain();
      source.buffer = noiseBuffer;
      silent.gain.value = 0;
      source.connect(silent); silent.connect(context.destination);
      source.onended = () => { safely(() => source.disconnect()); safely(() => silent.disconnect()); };
      source.start(0, 0, Math.min(.01, noiseBuffer.duration || .01));
    });
  }

  function resumeContext() {
    if (!context || context.state === 'running' || context.state === 'closed') return;
    if (resumePending) return;
    primeMobileOutput();
    const result = safely(() => context.resume());
    if (!result?.then) { safely(applyVolumes); return; }
    resumePending = result.then(() => {
      resumePending = null;
      safely(applyVolumes);
    }, () => { resumePending = null; });
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
          master.gain.value = muted || paused || documentHidden() ? 0 : levels.master;
          effectsBus.gain.value = levels.effects; ambientBus.gain.value = levels.ambient;
          effectsBus.connect(master); ambientBus.connect(master);
          master.connect(limiter); limiter.connect(context.destination);

          engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 37;
          engineFilter = context.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 118;
          engineGain = context.createGain(); engineGain.gain.value = .045;
          engine.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(ambientBus); engine.start();

          // Reuse samples instead of allocating arrays on every crank movement.
          noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 3), context.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          if ('onstatechange' in context) context.onstatechange = () => {
            if (context?.state === 'running') safely(applyVolumes);
          };
        } catch {
          settle(safely(() => context?.close()));
          clearContext();
          return;
        }
      }
      // Resume every non-running state from the operator gesture. Safari uses
      // `interrupted` after some background/foreground and route changes, not
      // only `suspended`, and may reject resume attempts made outside a gesture.
      resumeContext();
      safely(applyVolumes);
    });
  }

  function canPlay() {
    return context?.state === 'running' && effectsBus && !muted && !paused && !documentHidden() && levels.master > 0 && levels.effects > 0;
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

  function maintenance(detail = {}) {
    safely(() => {
      const result = maintenanceEffectCadence(maintenanceState, detail, Number(context?.currentTime));
      maintenanceState = result.state;
      if (!result.emit || !canPlay()) return;
      const progress = clamp(Number(result.emit.payload?.progress ?? 0), 0, 1);
      if (result.emit.type === 'extinguisher') {
        // Short filtered bursts follow the canonical maintenance cadence; no
        // second clock, loop or gameplay state is introduced here.
        noise(.16, .13 + progress * .04, 5200, { type: 'bandpass', endFrequency: 1500 });
        noise(.2, .07 + progress * .03, 8200, { type: 'highpass', endFrequency: 3400 });
      } else if (result.emit.type === 'repair') {
        tone(.07, .07 + progress * .025, 245, 150, 0, 'triangle');
        noise(.08, .08 + progress * .035, 3100, { type: 'bandpass', endFrequency: 900 });
      }
    });
  }

  const onMaintenanceFeedback = event => maintenance(event?.detail);
  const onVisibilityChange = () => safely(applyVolumes);
  globalThis.addEventListener?.('iron-rain:maintenance-feedback', onMaintenanceFeedback);
  globalThis.document?.addEventListener?.('visibilitychange', onVisibilityChange);

  function clearContext() {
    for (const voice of [...voices]) voice.cleanup();
    if (context && 'onstatechange' in context) context.onstatechange = null;
    context = master = effectsBus = ambientBus = engine = engineFilter = engineGain = noiseBuffer = null;
    resumePending = null; nextCrank = 0; maintenanceState = null;
  }

  function getVolumes() { return { ...levels, muted }; }
  function getStatus() { return { state: context?.state || 'uninitialized', muted, paused, ready: context?.state === 'running' && !muted }; }
  function setVolumes(next = {}) {
    if (next.master !== undefined) levels.master = clamp(Number(next.master), 0, 1);
    if (next.effects !== undefined) levels.effects = clamp(Number(next.effects), 0, 1.5);
    if (next.ambient !== undefined) levels.ambient = clamp(Number(next.ambient), 0, 1);
    safely(applyVolumes);
    return getVolumes();
  }

  return {
    wake, setVolumes, getVolumes, getStatus, maintenance,
    toggle() {
      muted = !muted;
      if (!muted) wake();
      safely(applyVolumes);
      return !muted;
    },
    update({ time = 0, moving = false, inside = true, speed = 0, paused: isPaused = false } = {}) {
      paused = Boolean(isPaused);
      safely(() => {
        // Keep autoplay-gated recovery attached to a real operator gesture.
        // A passive frame must not start a resume promise that can occupy
        // resumePending before Safari/iOS receives the next pointer/key event.
        applyVolumes();
        if (engine && context) {
          const velocity = clamp(speed, 0, 100);
          // Reuse the existing engine voice: inside the hull, speed now opens
          // the low-pass filter and raises the mechanical pulse slightly instead
          // of leaving a flat drone. No extra continuous oscillators are added.
          engine.frequency.setTargetAtTime(inside ? 37 + velocity * .055 : 40 + velocity * .12, context.currentTime, .4);
          engineFilter.frequency.setTargetAtTime(inside ? 118 + velocity * .42 : 85, context.currentTime, .4);
          engineGain.gain.setTargetAtTime(inside ? .045 + velocity * .00028 : .065, context.currentTime, .4);
        }
        if (moving && inside && time > nextFoot && !paused) {
          noise(.14, .28, 650); tone(.1, .1, 150, 70);
          // A short filtered return suggests a steel corridor without adding a
          // continuous reverb node or allocating another sample buffer.
          noise(.16, .11, 1850, { delay: .055, type: 'bandpass', endFrequency: 620 });
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
    load(cue = null) { safely(() => {
      // The loader cue owns no clock: it shapes one compact contact from the
      // mechanical phase already chosen by loader-arm.js. Each semantic phase
      // stays at one shared-buffer noise source + one tone for the mobile budget.
      const intensity = clamp(Number(cue?.intensity ?? 1), .25, 1);
      const profiles = {
        clamp: { noiseDuration: .065, noiseFrequency: 3400, noiseEnd: 1450, toneDuration: .065, toneFrequency: 390, toneEnd: 220 },
        swing: { noiseDuration: .11, noiseFrequency: 1550, noiseEnd: 610, toneDuration: .105, toneFrequency: 178, toneEnd: 116 },
        ram: { noiseDuration: .12, noiseFrequency: 1850, noiseEnd: 360, toneDuration: .12, toneFrequency: 118, toneEnd: 48 },
        lock: { noiseDuration: .07, noiseFrequency: 4100, noiseEnd: 1900, toneDuration: .07, toneFrequency: 470, toneEnd: 285 },
      };
      const profile = profiles[String(cue?.cue || '')] || {
        noiseDuration: .12, noiseFrequency: 2350, noiseEnd: 720,
        toneDuration: .1, toneFrequency: 205, toneEnd: 92,
      };
      noise(profile.noiseDuration, .34 * intensity, profile.noiseFrequency, { type: 'bandpass', endFrequency: profile.noiseEnd });
      tone(profile.toneDuration, .12 * intensity, profile.toneFrequency, profile.toneEnd, 0, 'triangle');
    }); },
    fire() { safely(() => {
      // Crack, pressure and a broad tail stay intact; two delayed steel returns
      // keep the hull readable while trimming transient Web Audio graph churn.
      noise(.16, 1.25, 6200, { endFrequency: 1300 });
      noise(1.65, 1.1, 1050, { endFrequency: 110 });
      tone(1.3, 1.1, 125, 43);
      tone(.36, .3, 290, 100, .025, 'triangle');
      noise(2.65, .55, 700, { delay: .12, endFrequency: 160 });
      for (const delay of [.08, .3]) noise(.2, .26, 1900, { delay, type: 'bandpass', endFrequency: 600 });
    }); },
    impact(feedback = null) { safely(() => {
      const intensity = clamp(Number(feedback?.intensity ?? .7), .15, 1);
      const crack = clamp(Number(feedback?.sharpCrack ?? .7), .1, 1);
      const thump = clamp(Number(feedback?.lowThump ?? .75), .1, 1);
      const rattle = clamp(Number(feedback?.metalRattle ?? .55), .1, 1);
      // A hull hit is heard through three physical paths: transmitted crack,
      // low pressure/body thump, and delayed internal metal rattle. The same
      // canonical cabin-hit feedback scales local and replicated impacts.
      noise(.12 + intensity * .12, .38 + crack * .58, 4600 + crack * 2400, { endFrequency: 720 + crack * 520 });
      noise(.65 + thump * .85, .28 + thump * .62, 620 + intensity * 180, { endFrequency: 70 + intensity * 45 });
      tone(.48 + thump * .52, .22 + thump * .48, 96 + intensity * 24, 34 + intensity * 10);
      noise(.22 + rattle * .38, .12 + rattle * .34, 1800 + intensity * 500, { delay: .055, type: 'bandpass', endFrequency: 430 + intensity * 180 });
    }); },
    radio() { safely(() => {
      noise(.18, .2, 2200, { type: 'bandpass' });
      tone(.055, .095, 1200, 1170, .02);
    }); },
    dispose() {
      globalThis.removeEventListener?.('iron-rain:maintenance-feedback', onMaintenanceFeedback);
      globalThis.document?.removeEventListener?.('visibilitychange', onVisibilityChange);
      safely(() => { for (const voice of [...voices]) safely(() => voice.source.stop()); });
      settle(safely(() => context?.close()));
      clearContext(); nextCrank = nextFoot = 0;
    },
  };
}
