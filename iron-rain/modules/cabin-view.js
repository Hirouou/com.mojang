import * as THREE from '../vendor/three.module.min.js';
import { createCabinView as createCabinViewCore } from './cabin-view-core.js';
import { createCabinCrewVisualLayer } from './crew-visual-layer.js';
import { maintenanceFeedback } from './maintenance-feedback.js';
import './maintenance-overlay.js';

/**
 * Public cabin renderer with the remote-crew visual layer attached.
 * Networking/session ownership stays outside: callers feed renderer-ready
 * samples from crew-runtime/crew-replication through updateRemoteCrew() or
 * the optional crewRemotes field accepted by update().
 */
export function createCabinView(canvas, options = {}) {
  let scene = null;
  let view = null;
  let activeCrewStation = null;
  let enteringCrewStation = null;
  const originalOnStation = options.onStation;
  const originalSceneAdd = THREE.Scene.prototype.add;

  const crewBridge = () => globalThis.ironRainEntry?.crewBridge || null;
  const stationResultEvent = result => {
    try {
      globalThis.dispatchEvent?.(new CustomEvent('ironrain:station-gate', { detail: { ...result } }));
    } catch {}
  };
  const requestCrewStation = station => {
    const bridge = crewBridge();
    if (!bridge?.requestStation) return { ok: true, ready: true, reason: 'single-player', station };
    let result;
    try { result = bridge.requestStation(station); }
    catch { result = { ok: false, ready: false, reason: 'claim-failed', station }; }
    stationResultEvent(result);
    return result;
  };
  const releaseCrewStation = station => {
    if (!station) return false;
    const bridge = crewBridge();
    let released = true;
    if (bridge?.releaseStation) {
      try { released = bridge.releaseStation(station) !== false; }
      catch { released = false; }
    }
    stationResultEvent({ ok: released, ready: false, reason: released ? 'released' : 'release-failed', station });
    return released;
  };

  const gatedOptions = {
    ...options,
    onStation(station) {
      const result = requestCrewStation(station);
      if (!result?.ready) return false;
      activeCrewStation = station;
      enteringCrewStation = station;
      try {
        return originalOnStation?.(station);
      } finally {
        enteringCrewStation = null;
      }
    },
  };

  THREE.Scene.prototype.add = function captureCabinScene(...objects) {
    scene ||= this;
    return originalSceneAdd.apply(this, objects);
  };

  let core;
  try {
    core = createCabinViewCore(canvas, gatedOptions);
  } finally {
    THREE.Scene.prototype.add = originalSceneAdd;
  }

  if (!scene) throw new Error('Cabin scene was not created');
  const crewVisuals = createCabinCrewVisualLayer(scene, { capacity: 2 });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const safeDt = value => Math.min(.1, Math.max(0, Number(value) || 0));

  function updateRemoteCrew(remotes = [], dt = 0) {
    return crewVisuals.update(remotes, 1, safeDt(dt));
  }

  function publishMaintenance(engine) {
    const detail = maintenanceFeedback(engine);
    try {
      globalThis.dispatchEvent?.(new CustomEvent('iron-rain:maintenance-feedback', { detail }));
    } catch {}
    return detail;
  }

  function clearMaintenance() {
    try {
      globalThis.dispatchEvent?.(new CustomEvent('iron-rain:maintenance-feedback', { detail: { active: false } }));
    } catch {}
  }

  function leaveCrewStation() {
    // Entering the drive station switches the main game to field view, which
    // synchronously asks the cabin renderer to leave its local interaction.
    // Keep ownership during that transition; the later real leave/deploy call
    // releases the driver station normally.
    if (activeCrewStation && enteringCrewStation !== activeCrewStation) {
      releaseCrewStation(activeCrewStation);
      activeCrewStation = null;
    }
    return core.leaveStation?.();
  }

  view = {
    ...core,
    leaveStation: leaveCrewStation,
    update(dt, data = {}) {
      core.update(dt, data);
      if (own(data, 'engine')) publishMaintenance(data.engine);
      if (own(data, 'crewRemotes')) updateRemoteCrew(data.crewRemotes, dt);
    },
    updateRemoteCrew,
    crewStation() { return activeCrewStation; },
    reset() {
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = enteringCrewStation = null;
      clearMaintenance();
      core.reset();
      crewVisuals.clear();
    },
    snapshot() {
      return { ...core.snapshot(), crewStation: activeCrewStation, crew: crewVisuals.snapshot() };
    },
    dispose() {
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = enteringCrewStation = null;
      clearMaintenance();
      crewVisuals.dispose();
      core.dispose();
    },
  };

  // Integration seam only: renderer stays transport-agnostic. Bootstrap can
  // attach the crew runtime after the asynchronously-created cabin is ready.
  try {
    globalThis.dispatchEvent?.(new CustomEvent('ironrain:cabin-ready', { detail: { cabin: view } }));
  } catch {}

  return view;
}
