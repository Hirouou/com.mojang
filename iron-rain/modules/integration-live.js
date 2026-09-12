import { installSpawnSelector, resolveSpawnChoice } from './spawn-selector.js';
import { createWarAudio } from './war-audio.js';
import { maintenanceEffectCadence } from './maintenance-effect-cadence.js';

const audio = createWarAudio();
let selector = null;
let unsubscribeEffects = null;
let lastRuntime = null;
let hookedFire = null;
let destroyedOpen = false;
let maintenanceCadenceState = null;

const wake = () => audio.wake();
addEventListener('pointerdown', wake, { passive: true });
addEventListener('keydown', wake, { passive: true });

function toast(message, source = 'TRIPULAÇÃO') {
  const shell = document.getElementById('warToast');
  const label = document.getElementById('warToastSource');
  const text = document.getElementById('warToastText');
  if (!shell || !text) return;
  if (label) label.textContent = source;
  text.textContent = message;
  shell.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => shell.classList.add('hidden'), 2800);
}

function applyRemoteEffect(effect) {
  if (!effect?.type) return;
  try { dispatchEvent(new CustomEvent('ironrain:shared-crew-effect', { detail: { ...effect, remote: true } })); } catch {}
  if (effect.type === 'fire') {
    audio.fire();
    toast('OUTRO TRIPULANTE DISPAROU · recuo e recarga sincronizados.', 'MAMUTE');
  } else if (effect.type === 'reload') audio.load(effect.payload);
  else if (effect.type === 'impact' || effect.type === 'critical') {
    audio.impact();
    toast(effect.type === 'critical' ? 'ESTADO CRÍTICO · toda a tripulação recebeu o alerta.' : 'IMPACTO NO CASCO · sentido por toda a tripulação.', 'CASCO');
  } else if (effect.type === 'repair') audio.load({ intensity: .45 });
  else if (effect.type === 'extinguisher') audio.load({ intensity: .35 });
}

function bindRuntime() {
  const runtime = globalThis.ironRainEntry?.runtime;
  if (!runtime || runtime === lastRuntime) return;
  unsubscribeEffects?.();
  lastRuntime = runtime;
  maintenanceCadenceState = null;
  unsubscribeEffects = runtime.subscribeEffects?.(applyRemoteEffect) || null;
}

function bindFire() {
  const fire = document.getElementById('fireBtn');
  if (!fire || fire === hookedFire) return;
  hookedFire = fire;
  fire.addEventListener('click', () => {
    const runtime = globalThis.ironRainEntry?.runtime;
    if (!runtime?.emitEffect || fire.disabled) return;
    runtime.emitEffect('fire', { at: performance.now() / 1000 });
    runtime.emitEffect('reload', { duration: 2.8, phase: 'extract' });
  }, { capture: true });
}

function installSelectorWhenReady() {
  if (selector) return;
  const lobbyRoot = document.querySelector('.crew-lobby');
  if (!lobbyRoot) return;
  const facade = {
    element: lobbyRoot,
    faction() {
      return lobbyRoot.querySelector('[data-crew-faction].active')?.dataset.crewFaction || null;
    },
  };
  selector = installSpawnSelector({
    lobby: facade,
    onChange(spawn) {
      globalThis.ironRainSpawnChoice = spawn ? { ...spawn } : null;
      if (globalThis.ironRainEntry && !globalThis.ironRainEntry.spawn) globalThis.ironRainEntry.spawn = spawn ? { ...spawn } : null;
    },
  });
  lobbyRoot.addEventListener('click', event => {
    if (!event.target.closest('[data-crew-faction]')) return;
    queueMicrotask(() => selector?.refresh?.());
  });
}

addEventListener('iron-rain:maintenance-feedback', event => {
  const runtime = globalThis.ironRainEntry?.runtime;
  if (!runtime?.emitEffect) return;
  const cadence = maintenanceEffectCadence(maintenanceCadenceState, event.detail || {}, performance.now() / 1000);
  maintenanceCadenceState = cadence.state;
  if (cadence.emit) runtime.emitEffect(cadence.emit.type, cadence.emit.payload);
});

addEventListener('ironrain:mamute-impact', event => {
  const runtime = globalThis.ironRainEntry?.runtime;
  if (!runtime?.emitEffect) return;
  const detail = event.detail || {};
  runtime.emitEffect(detail.critical ? 'critical' : 'impact', detail);
});

addEventListener('ironrain:mamute-destroyed', () => {
  destroyedOpen = true;
  const faction = globalThis.ironRainEntry?.faction;
  const current = globalThis.ironRainSpawnChoice?.id;
  const fallback = resolveSpawnChoice(faction, current);
  if (fallback) {
    globalThis.ironRainSpawnChoice = { ...fallback };
    globalThis.ironRainEntry.pendingRespawn = { ...fallback };
  }
  const lobbyRoot = document.querySelector('.crew-lobby');
  if (lobbyRoot) {
    lobbyRoot.classList.remove('hidden');
    selector?.refresh?.();
    const copy = lobbyRoot.querySelector('[data-crew-copy]');
    if (copy) copy.textContent = 'Mamute destruído. Escolha um hexágono 100% dominado pela sua facção para renascer.';
  }
});

setInterval(() => {
  installSelectorWhenReady();
  bindRuntime();
  bindFire();
  if (destroyedOpen && globalThis.ironRainEntry?.pendingRespawn) {
    const chosen = globalThis.ironRainSpawnChoice;
    if (chosen?.id && chosen.id !== globalThis.ironRainEntry.pendingRespawn.id) globalThis.ironRainEntry.pendingRespawn = { ...chosen };
  }
}, 250);

addEventListener('beforeunload', () => { unsubscribeEffects?.(); audio.dispose(); }, { once: true });
