import { installSpawnSelector, resolveSpawnChoice } from './spawn-selector.js';
import { createWarAudio } from './war-audio.js';
import { maintenanceEffectCadence } from './maintenance-effect-cadence.js';
import { remoteMaintenanceFeedback } from './remote-maintenance-feedback.js';
import { remoteHullImpactFeedback } from './remote-hull-impact-feedback.js';
import { createArtilleryShotReplayGuard } from './artillery-shot-replay-guard.js';
import { DEFAULT_BINDINGS, eventCode, restoreBindings } from './key-bindings.js';

const audio = createWarAudio();
const remoteShotReplayGuard = createArtilleryShotReplayGuard(64);
let selector = null;
let unsubscribeEffects = null;
let unsubscribeCommandResults = null;
let lastRuntime = null;
let fireObserver = null;
let observedFireButton = null;
let fireArmed = true;
let suppressObservedFire = false;
let authoritativeFireReplay = false;
let guestFirePendingShotId = null;
let guestFirePendingCommandSeq = null;
let shotSerial = 0;
const shotSession = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function remoteFireReplayKey(effect) {
  return String(effect?.payload?.shotId || '').trim();
}

function effectFromLocalShooter(effect) {
  const shooterId = String(effect?.payload?.shooterId || '').trim();
  const localId = String(globalThis.ironRainEntry?.runtime?.status?.()?.localId || globalThis.ironRainEntry?.localId || '').trim();
  return Boolean(shooterId && localId && shooterId === localId);
}

function showRemoteMaintenance(kind, progress) {
  const detail = remoteMaintenanceFeedback(kind, progress);
  if (!detail) return;
  audio.maintenance(detail);
  try { dispatchEvent(new CustomEvent('iron-rain:maintenance-feedback', { detail })); } catch {}
}

function clearPendingGuestFire() {
  guestFirePendingShotId = null;
  guestFirePendingCommandSeq = null;
}

function replayAuthoritativeLocalFire(effect) {
  const fire = document.getElementById('fireBtn');
  const shotId = remoteFireReplayKey(effect);
  if (guestFirePendingShotId && shotId !== guestFirePendingShotId) return false;
  clearPendingGuestFire();
  if (!fire || fire.disabled) return false;
  authoritativeFireReplay = true;
  suppressObservedFire = true;
  try {
    fire.click();
    return true;
  } finally {
    authoritativeFireReplay = false;
  }
}

function applyCommandResult(result) {
  if (!guestFirePendingShotId || result?.authoritative !== true || result?.type !== 'fire' || result?.ok !== false) return;
  const resultShotId = String(result?.shotId || '').trim();
  const resultSeq = Number(result?.seq);
  const sameShot = Boolean(resultShotId && resultShotId === guestFirePendingShotId);
  const sameCommand = guestFirePendingCommandSeq != null && Number.isFinite(resultSeq) && resultSeq === guestFirePendingCommandSeq;
  if (!sameShot && !sameCommand) return;
  clearPendingGuestFire();
  const reason = String(result?.reason || 'rejeitado pelo host').replaceAll('-', ' ');
  toast(`DISPARO RECUSADO · ${reason}.`, 'PONTARIA');
}

function applyRemoteEffect(effect) {
  if (!effect?.type) return;
  if (effect.type === 'fire' && !remoteShotReplayGuard.accept(remoteFireReplayKey(effect))) return;
  if (effect.type === 'fire' && effectFromLocalShooter(effect)) { replayAuthoritativeLocalFire(effect); return; }
  if (effect.type === 'reload' && effectFromLocalShooter(effect)) return;
  try { dispatchEvent(new CustomEvent('ironrain:shared-crew-effect', { detail: { ...effect, remote: true } })); } catch {}
  if (effect.type === 'fire') { audio.fire(); toast('OUTRO TRIPULANTE DISPAROU · recuo e recarga sincronizados.', 'MAMUTE'); }
  else if (effect.type === 'reload') audio.load(effect.payload);
  else if (effect.type === 'impact' || effect.type === 'critical') {
    const feedback = remoteHullImpactFeedback(effect);
    audio.impact(feedback || effect.payload || effect);
    toast(effect.type === 'critical' ? 'ESTADO CRÍTICO · toda a tripulação recebeu o alerta.' : 'IMPACTO NO CASCO · sentido por toda a tripulação.', 'CASCO');
  }
  else if (effect.type === 'repair') showRemoteMaintenance('repair', effect.payload?.progress);
  else if (effect.type === 'extinguisher') showRemoteMaintenance('extinguish', effect.payload?.progress);
}

function bindRuntime() {
  const runtime = globalThis.ironRainEntry?.runtime;
  if (!runtime || runtime === lastRuntime) return;
  unsubscribeEffects?.(); unsubscribeCommandResults?.(); lastRuntime = runtime; maintenanceCadenceState = null; clearPendingGuestFire();
  unsubscribeEffects = runtime.subscribeEffects?.(applyRemoteEffect) || null;
  unsubscribeCommandResults = runtime.subscribeCommandResults?.(applyCommandResult) || null;
}

function numericReadout(id) {
  const text = String(document.getElementById(id)?.textContent || '');
  const match = text.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function nextShotIdentity(runtime) {
  const status = runtime?.status?.() || {};
  const shooterId = String(status.localId || globalThis.ironRainEntry?.localId || 'local');
  const mamuteId = String(status.room || globalThis.ironRainEntry?.room || 'solo');
  shotSerial += 1;
  return Object.freeze({ shotId: `${mamuteId}:${shooterId}:${shotSession}:${shotSerial}`, shooterId, mamuteId, shotSerial });
}

function liveShotPayload() {
  const runtime = globalThis.ironRainEntry?.runtime;
  const shell = document.querySelector('.ammo.active')?.dataset.shell || 'HE';
  const ammoId = shell === 'SMOKE' ? 'smokeCount' : shell === 'FRAG' ? 'fragCount' : 'heCount';
  const identity = nextShotIdentity(runtime);
  return Object.freeze({
    at: performance.now() / 1000,
    ...identity,
    shell,
    charge: numericReadout('chargeValue'),
    bearing: numericReadout('azValue'),
    elevation: numericReadout('elValue'),
    ammoRemaining: numericReadout(ammoId),
  });
}

function canReplicateLocalShot(runtime) {
  const status = runtime?.status?.();
  if (!status || status.mode === 'offline') return false;
  return runtime.stationOwner?.('aim') === status.localId;
}

function emitLocalShot(payload = liveShotPayload()) {
  if (suppressObservedFire) { suppressObservedFire = false; return null; }
  const runtime = globalThis.ironRainEntry?.runtime;
  if (!runtime?.issueCommand || !canReplicateLocalShot(runtime)) return null;
  return runtime.issueCommand('fire', payload);
}

function guestOwnsAim(runtime) {
  const status = runtime?.status?.();
  return status?.mode === 'guest' && runtime.stationOwner?.('aim') === status.localId;
}

function currentAimBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem('iron-rain-settings') || 'null');
    return restoreBindings(saved?.bindings);
  } catch { return DEFAULT_BINDINGS; }
}

function currentFireBinding() {
  return currentAimBindings().fire;
}

function guestFirePending() {
  return Boolean(guestFirePendingShotId);
}

function pendingGuestAimPointer(event) {
  if (!guestFirePending() || authoritativeFireReplay) return;
  if (!event.target?.closest?.('#fireDeck')) return;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
}

function pendingGuestAimKey(event) {
  if (!guestFirePending() || authoritativeFireReplay) return;
  if (event.target?.matches?.('input,select,textarea,[contenteditable="true"]')) return;
  const code = eventCode(event);
  const bindings = currentAimBindings();
  if (code !== bindings.fire && code !== bindings.chargeUp && code !== bindings.chargeDown) return;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
}

function interceptGuestFire(event) {
  if (authoritativeFireReplay) return false;
  const runtime = globalThis.ironRainEntry?.runtime;
  const fire = document.getElementById('fireBtn');
  if (!runtime?.issueCommand || !fire || fire.disabled || !guestOwnsAim(runtime)) return false;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  if (guestFirePending()) return true;
  const payload = liveShotPayload();
  guestFirePendingShotId = payload.shotId;
  guestFirePendingCommandSeq = null;
  const result = emitLocalShot(payload);
  if (result?.pending && guestFirePendingShotId === payload.shotId) {
    guestFirePendingCommandSeq = Number.isFinite(Number(result.seq)) ? Number(result.seq) : null;
    toast('DISPARO ENVIADO · aguardando autorização do Mamute.', 'PONTARIA');
  } else if (!result?.pending && guestFirePendingShotId === payload.shotId) {
    clearPendingGuestFire();
  }
  return true;
}

function interceptGuestFireClick(event) {
  if (!event.target?.closest?.('#fireBtn')) return;
  interceptGuestFire(event);
}

function interceptGuestFireKey(event) {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target?.matches?.('input,select,textarea,[contenteditable="true"]')) return;
  if (eventCode(event) !== currentFireBinding()) return;
  interceptGuestFire(event);
}

addEventListener('pointerdown', pendingGuestAimPointer, true);
addEventListener('pointermove', pendingGuestAimPointer, true);
addEventListener('click', pendingGuestAimPointer, true);
addEventListener('keydown', pendingGuestAimKey, true);
addEventListener('click', interceptGuestFireClick, true);
addEventListener('keydown', interceptGuestFireKey, true);

function bindFireState() {
  const fire = document.getElementById('fireBtn');
  if (!fire || fire === observedFireButton) return;
  fireObserver?.disconnect(); observedFireButton = fire; fireArmed = true;
  const check = () => {
    const text = String(fire.textContent || '').trim().toUpperCase();
    // Reload/round-selection also uses CARREGANDO. Only the launch states prove
    // that fireShell actually committed a shot locally.
    const firing = text === 'FOGO!' || text === 'EM VOO';
    if (firing && fireArmed) { fireArmed = false; emitLocalShot(); }
    else if (text === 'DISPARAR' && !fire.disabled) fireArmed = true;
  };
  fireObserver = new MutationObserver(check);
  fireObserver.observe(fire, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  check();
}

function installSelectorWhenReady() {
  if (selector) return;
  const lobbyRoot = document.querySelector('.crew-lobby');
  if (!lobbyRoot) return;
  const facade = { element: lobbyRoot, faction() { return lobbyRoot.querySelector('[data-crew-faction].active')?.dataset.crewFaction || null; } };
  selector = installSpawnSelector({
    lobby: facade,
    onChange(spawn) {
      globalThis.ironRainSpawnChoice = spawn ? { ...spawn } : null;
      if (globalThis.ironRainEntry && !destroyedOpen) globalThis.ironRainEntry.spawn = spawn ? { ...spawn } : null;
    },
    onConfirm(spawn) {
      const entry = globalThis.ironRainEntry;
      if (!destroyedOpen || !entry || !spawn) return;
      entry.pendingRespawn = { ...spawn };
      const root = document.querySelector('.crew-lobby');
      root?.classList.add('hidden');
      toast(`RESPAWN CONFIRMADO · ${spawn.name} · ${(spawn.distanceToFront/1000).toFixed(1)} km do front`, 'COMANDO');
    },
  });
  lobbyRoot.addEventListener('click', event => { if (event.target.closest('[data-crew-faction]')) queueMicrotask(() => selector?.refresh?.()); });
}

addEventListener('iron-rain:maintenance-feedback', event => {
  if (event.detail?.remote) return;
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
  const entry = globalThis.ironRainEntry;
  entry && (entry.pendingRespawn = null);
  const fallback = resolveSpawnChoice(entry?.faction, entry?.spawn?.id || globalThis.ironRainSpawnChoice?.id);
  if (fallback) globalThis.ironRainSpawnChoice = { ...fallback };
  const lobbyRoot = document.querySelector('.crew-lobby');
  if (lobbyRoot) {
    lobbyRoot.classList.remove('hidden');
    selector?.setRespawnMode?.(true);
    selector?.refresh?.();
    const copy = lobbyRoot.querySelector('[data-crew-copy]');
    const status = lobbyRoot.querySelector('[data-crew-status]');
    if (status) status.textContent = 'MAMUTE DESTRUÍDO · ESCOLHA O RESPAWN';
    if (copy) copy.textContent = 'Escolha um hexágono 100% dominado pela sua facção. Os mais próximos do front aparecem primeiro e só renasce após confirmar.';
  }
});

addEventListener('ironrain:respawn-applied', event => {
  destroyedOpen = false;
  selector?.setRespawnMode?.(false);
  document.querySelector('.crew-lobby')?.classList.add('hidden');
  const spawn = event.detail?.spawn;
  if (spawn?.name) toast(`MAMUTE REINSERIDO · ${spawn.name}`, 'COMANDO');
});

const timer = setInterval(() => { installSelectorWhenReady(); bindRuntime(); bindFireState(); }, 180);

addEventListener('beforeunload', () => { clearInterval(timer); fireObserver?.disconnect(); unsubscribeEffects?.(); unsubscribeCommandResults?.(); audio.dispose(); }, { once: true });
