import * as THREE from '../vendor/three.module.min.js';
import { createCabinView as createCabinViewCore } from './cabin-view-core.js';
import { createCabinCrewVisualLayer } from './crew-visual-layer.js';
import { maintenanceFeedback } from './maintenance-feedback.js';
import { remoteHullImpactFeedback } from './remote-hull-impact-feedback.js';
import { beginLoading, stepLoading } from './loading-cycle.js';
import './maintenance-overlay.js';

export function createCabinView(canvas, options = {}) {
  // Single-player is deliberately isolated from crew scene interception.
  // The online path remains canonical for host/guest sessions, while offline
  // can always boot the proven core renderer even if crew presentation regresses.
  if (globalThis.ironRainEntry?.mode === 'offline') {
    const core = createCabinViewCore(canvas, options);
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:cabin-ready', { detail: { cabin: core } })); } catch {}
    return core;
  }

  let scene = null;
  let view = null;
  let activeCrewStation = null;
  let enteringCrewStation = null;
  let remoteLoading = null;
  let remoteRecoil = 0;
  let remoteImpact = 0;
  const originalOnStation = options.onStation;
  const originalSceneAdd = THREE.Scene.prototype.add;

  const crewBridge = () => globalThis.ironRainEntry?.crewBridge || null;
  const stationResultEvent = result => { try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:station-gate', { detail: { ...result } })); } catch {} };
  const requestCrewStation = station => {
    const bridge = crewBridge();
    if (!bridge?.requestStation) return { ok: true, ready: true, reason: 'single-player', station };
    let result; try { result = bridge.requestStation(station); } catch { result = { ok: false, ready: false, reason: 'claim-failed', station }; }
    stationResultEvent(result); return result;
  };
  const releaseCrewStation = station => {
    if (!station) return false;
    const bridge = crewBridge(); let released = true;
    if (bridge?.releaseStation) { try { released = bridge.releaseStation(station) !== false; } catch { released = false; } }
    stationResultEvent({ ok: released, ready: false, reason: released ? 'released' : 'release-failed', station });
    return released;
  };

  const gatedOptions = {
    ...options,
    onStation(station) {
      const result = requestCrewStation(station);
      if (!result?.ready) return false;
      activeCrewStation = station; enteringCrewStation = station;
      try { return originalOnStation?.(station); } finally { enteringCrewStation = null; }
    },
  };

  THREE.Scene.prototype.add = function captureCabinScene(...objects) { scene ||= this; return originalSceneAdd.apply(this, objects); };
  let core;
  try { core = createCabinViewCore(canvas, gatedOptions); } finally { THREE.Scene.prototype.add = originalSceneAdd; }
  if (!scene) throw new Error('Cabin scene was not created');
  const crewVisuals = createCabinCrewVisualLayer(scene, { capacity: 2 });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const safeDt = value => Math.min(.1, Math.max(0, Number(value) || 0));

  function updateRemoteCrew(remotes = [], dt = 0) { return crewVisuals.update(remotes, 1, safeDt(dt)); }
  function publishMaintenance(engine) {
    const detail = maintenanceFeedback(engine);
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:maintenance-feedback', { detail })); } catch {}
    return detail;
  }
  function clearMaintenance() { try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:maintenance-feedback', { detail: { active: false } })); } catch {} }

  function onSharedCrewEffect(event) {
    const effect = event.detail || {};
    if (!effect.remote) return;
    if (effect.type === 'fire') { remoteRecoil = Math.max(remoteRecoil, 1); remoteImpact = Math.max(remoteImpact, .45); }
    if (effect.type === 'reload') {
      const shell = ['HE','FRAG','SMOKE'].includes(effect.payload?.shell) ? effect.payload.shell : 'HE';
      remoteLoading = beginLoading(shell, shell);
    }
    if (effect.type === 'impact' || effect.type === 'critical') {
      const feedback = remoteHullImpactFeedback(effect);
      if (feedback) remoteImpact = Math.max(remoteImpact, feedback.intensity);
    }
  }
  globalThis.addEventListener?.('ironrain:shared-crew-effect', onSharedCrewEffect);

  function leaveCrewStation() {
    if (activeCrewStation && enteringCrewStation !== activeCrewStation) {
      if (!releaseCrewStation(activeCrewStation)) return false;
      activeCrewStation = null;
    }
    return core.leaveStation?.();
  }

  view = {
    ...core,
    leaveStation: leaveCrewStation,
    update(dt, data = {}) {
      const elapsed = safeDt(dt);
      if (remoteLoading) { stepLoading(remoteLoading, elapsed); if (remoteLoading.complete) remoteLoading = null; }
      remoteRecoil = Math.max(0, remoteRecoil - elapsed * 2.2);
      remoteImpact = Math.max(0, remoteImpact - elapsed * 2.8);
      const merged = { ...data };
      if (!merged.loading && remoteLoading) merged.loading = remoteLoading;
      merged.recoil = Math.max(Number(merged.recoil) || 0, remoteRecoil);
      core.update(dt, merged);
      const shake = Math.max(remoteRecoil * 2.4, remoteImpact * 4.2);
      if (shake > .05) {
        const t = performance.now() * .055;
        canvas.style.transform = `translate(${Math.sin(t) * shake}px,${Math.cos(t * 1.37) * shake * .55}px)`;
        canvas.style.filter = remoteImpact > .65 ? `brightness(${1 + remoteImpact * .16})` : '';
      } else { canvas.style.transform = ''; canvas.style.filter = ''; }
      if (own(data, 'engine')) publishMaintenance(data.engine);
      if (own(data, 'crewRemotes')) updateRemoteCrew(data.crewRemotes, dt);
    },
    updateRemoteCrew,
    crewStation() { return activeCrewStation; },
    reset() {
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = enteringCrewStation = null; remoteLoading = null; remoteRecoil = remoteImpact = 0;
      canvas.style.transform = ''; canvas.style.filter = '';
      clearMaintenance(); core.reset(); crewVisuals.clear();
    },
    snapshot() { return { ...core.snapshot(), crewStation: activeCrewStation, crew: crewVisuals.snapshot(), remoteLoading: remoteLoading ? { ...remoteLoading } : null }; },
    dispose() {
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = enteringCrewStation = null;
      globalThis.removeEventListener?.('ironrain:shared-crew-effect', onSharedCrewEffect);
      canvas.style.transform = ''; canvas.style.filter = '';
      clearMaintenance(); crewVisuals.dispose(); core.dispose();
    },
  };

  try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:cabin-ready', { detail: { cabin: view } })); } catch {}
  return view;
}
