import * as THREE from '../vendor/three.module.min.js';
import { createCabinView as createCabinViewCore } from './cabin-view-core.js';
import { createCabinCrewVisualLayer } from './crew-visual-layer.js';
import { maintenanceFeedback } from './maintenance-feedback.js';
import { hullImpactFeedback } from './cabin-hit-feedback.js';
import { remoteHullImpactFeedback } from './remote-hull-impact-feedback.js';
import { loaderRigState } from './loader-arm.js';
import { beginLoading, stepLoading } from './loading-cycle.js';
import './maintenance-overlay.js';

function createLoaderArmVisual(scene) {
  const geometries = [];
  const materials = [];
  const mat = (color, emissive = 0x000000) => {
    const material = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
    materials.push(material);
    return material;
  };
  const steel = mat('#4b5650');
  const dark = mat('#202826');
  const brass = mat('#a7935b');
  const warning = mat('#8e6b3d', '#2d1b0d');
  const shellBand = mat('#71362d');
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  geometries.push(boxGeo, cylGeo);
  const mesh = (geo, material, parent, x, y, z, sx, sy, sz) => {
    const object = new THREE.Mesh(geo, material);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    parent.add(object);
    return object;
  };

  const root = new THREE.Group();
  root.position.set(1.76, .48, .72);
  scene.add(root);
  mesh(cylGeo, dark, root, 0, .08, 0, .19, .16, .19);
  mesh(cylGeo, steel, root, 0, .22, 0, .13, .16, .13);
  const shoulder = new THREE.Group();
  shoulder.position.set(0, .34, 0);
  root.add(shoulder);
  mesh(boxGeo, steel, shoulder, 0, 0, .29, .18, .18, .58);
  const elbow = new THREE.Group();
  elbow.position.set(0, 0, .58);
  shoulder.add(elbow);
  mesh(cylGeo, warning, elbow, 0, 0, 0, .12, .2, .12).rotation.z = Math.PI / 2;
  const fore = mesh(boxGeo, steel, elbow, 0, 0, .28, .15, .15, .56);
  const wrist = new THREE.Group();
  elbow.add(wrist);
  const rammer = mesh(boxGeo, dark, wrist, 0, 0, -.13, .1, .1, .3);
  const clawLeft = mesh(boxGeo, warning, wrist, -.12, 0, .06, .055, .12, .28);
  const clawRight = mesh(boxGeo, warning, wrist, .12, 0, .06, .055, .12, .28);
  const shell = new THREE.Group();
  wrist.add(shell);
  const shellBody = mesh(cylGeo, brass, shell, 0, 0, .25, .082, .48, .082);
  shellBody.rotation.x = Math.PI / 2;
  const band = mesh(cylGeo, shellBand, shell, 0, 0, .11, .086, .075, .086);
  band.rotation.x = Math.PI / 2;
  const tip = mesh(cylGeo, steel, shell, 0, 0, .51, .058, .12, .058);
  tip.rotation.x = Math.PI / 2;

  let current = loaderRigState(null);
  function update(cycle) {
    current = loaderRigState(cycle);
    const joints = current.joints;
    root.rotation.y = joints.baseYaw;
    shoulder.rotation.x = joints.shoulder;
    elbow.rotation.x = -joints.elbow * .72;
    const reach = .56 + joints.extension * .72;
    fore.scale.z = reach;
    fore.position.z = reach * .5;
    wrist.position.set(0, 0, reach);
    const jaw = .1 + joints.claw * .28;
    clawLeft.position.x = -jaw;
    clawRight.position.x = jaw;
    clawLeft.rotation.y = -.2 - joints.claw * .5;
    clawRight.rotation.y = .2 + joints.claw * .5;
    rammer.position.z = -.13 + joints.rammer * .28;
    shell.visible = current.shell.visible;
    shell.position.z = joints.rammer * .24;
    warning.emissiveIntensity = current.active ? .32 : .05;
  }
  update(null);

  return {
    update,
    snapshot() {
      return {
        active: current.active,
        phase: current.phase,
        shellVisible: current.shell.visible,
        shellOwner: current.shell.owner,
      };
    },
    dispose() {
      scene.remove(root);
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}

function createHullImpactVisual(scene, { reducedMotion = false } = {}) {
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const group = new THREE.Group();
  scene.add(group);
  const dustGeometry = new THREE.IcosahedronGeometry(.045, 0);
  const shardGeometry = new THREE.BoxGeometry(.055, .025, .11);
  const dustMaterial = new THREE.MeshLambertMaterial({ color: '#8f8a76', transparent: true, opacity: 0, flatShading: true });
  const shardMaterial = new THREE.MeshLambertMaterial({ color: '#6b7168', emissive: '#21140b', transparent: true, opacity: 0, flatShading: true });
  const flash = new THREE.PointLight('#ffc58d', 0, 5.4, 2);
  flash.position.set(.15, 2.1, -.8);
  scene.add(flash);
  const particles = [];
  const particleCount = reducedMotion ? 6 : 12;
  for (let i = 0; i < particleCount; i++) {
    const particle = new THREE.Mesh(i % 3 ? dustGeometry : shardGeometry, i % 3 ? dustMaterial : shardMaterial);
    particle.userData.seed = i * 1.618;
    group.add(particle);
    particles.push(particle);
  }
  group.visible = false;
  let energy = 0;
  let flashEnergy = 0;
  let dustEnergy = 0;
  let flickerEnergy = 0;
  let age = 1;

  function kick(feedback) {
    const intensity = clamp01(feedback?.intensity ?? feedback);
    energy = Math.max(energy, intensity);
    flashEnergy = Math.max(flashEnergy, clamp01(feedback?.hullFlash ?? intensity));
    dustEnergy = Math.max(dustEnergy, clamp01(feedback?.dustKick ?? intensity));
    flickerEnergy = Math.max(flickerEnergy, clamp01(feedback?.lampFlicker ?? 0));
    age = 0;
    group.visible = energy > .01 || dustEnergy > .01;
  }

  function update(dt) {
    const step = Math.min(.1, Math.max(0, Number(dt) || 0));
    age += step;
    energy = Math.max(0, energy - step * 1.85);
    flashEnergy = Math.max(0, flashEnergy - step * 2.6);
    dustEnergy = Math.max(0, dustEnergy - step * 1.65);
    flickerEnergy = Math.max(0, flickerEnergy - step * 3.4);
    const particlesActive = energy > .015 || dustEnergy > .015;
    const lightActive = flashEnergy > .015 || flickerEnergy > .015;
    group.visible = particlesActive;
    if (!particlesActive && !lightActive) {
      energy = flashEnergy = dustEnergy = flickerEnergy = 0;
      age = 1;
      flash.intensity = 0;
      dustMaterial.opacity = shardMaterial.opacity = 0;
      shardMaterial.emissiveIntensity = 0;
      return;
    }
    const motionAge = reducedMotion ? 0 : age;
    const burst = reducedMotion ? 0 : Math.max(0, 1 - age * 2.2);
    const flicker = reducedMotion ? flickerEnergy * 1.6 : flickerEnergy * (1.3 + Math.abs(Math.sin(age * 83)) * 2.2);
    flash.intensity = flashEnergy * 17 + flicker;
    dustMaterial.opacity = Math.min(.68, dustEnergy * .72);
    shardMaterial.opacity = Math.min(.82, energy * .9);
    shardMaterial.emissiveIntensity = flashEnergy * 1.15;
    if (!particlesActive) return;
    particles.forEach((particle, i) => {
      const seed = particle.userData.seed;
      const spread = .16 + (i % 5) * .08;
      particle.position.set(
        Math.sin(seed * 4.1) * spread * (1 + motionAge * 1.8),
        2.36 - motionAge * (.45 + (i % 4) * .09),
        -.95 + Math.cos(seed * 2.7) * spread - motionAge * (.1 + (i % 3) * .05),
      );
      particle.rotation.set(
        seed + motionAge * (2 + i % 3),
        seed * .6 + motionAge * 1.7,
        motionAge * (3 + i % 4),
      );
      particle.scale.setScalar(reducedMotion ? .82 : .55 + burst * (.8 + (i % 4) * .16));
    });
  }

  return {
    kick,
    update,
    reset() {
      energy = flashEnergy = dustEnergy = flickerEnergy = 0;
      age = 1;
      flash.intensity = 0;
      dustMaterial.opacity = shardMaterial.opacity = 0;
      shardMaterial.emissiveIntensity = 0;
      group.visible = false;
    },
    snapshot() { return { active: group.visible, intensity: energy, flash: flashEnergy, dust: dustEnergy, flicker: flickerEnergy }; },
    dispose() {
      scene.remove(group);
      scene.remove(flash);
      dustGeometry.dispose();
      shardGeometry.dispose();
      dustMaterial.dispose();
      shardMaterial.dispose();
    },
  };
}

export function createCabinView(canvas, options = {}) {
  // Diagnostic escape hatch only. Product solo play stays on the crew-aware
  // authority seam; this path exists strictly to isolate renderer boot/WebGL QA.
  if (globalThis.ironRainEntry?.mode === 'offline' && options.allowOfflineCabinQa === true) {
    const core = createCabinViewCore(canvas, options);
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:cabin-ready', { detail: { cabin: core } })); } catch {}
    return core;
  }

  let scene = null;
  let view = null;
  let activeCrewStation = null;
  let pendingCrewStation = null;
  let enteringCrewStation = null;
  let remoteLoading = null;
  let remoteRecoil = 0;
  let remoteImpact = 0;
  const originalOnStation = options.onStation;
  const originalOnPointerUnlock = options.onPointerUnlock;
  const originalSceneAdd = THREE.Scene.prototype.add;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  const crewBridge = () => globalThis.ironRainEntry?.crewBridge || null;
  const stationResultEvent = result => { try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:station-gate', { detail: { ...result } })); } catch {} };
  const requestCrewStation = station => {
    const bridge = crewBridge();
    if (!bridge?.requestStation) {
      const result = { ok: false, ready: false, pending: false, reason: 'authority-unavailable', station };
      stationResultEvent(result);
      return result;
    }
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
      if (!result?.ready) {
        pendingCrewStation = result?.pending ? station : null;
        return false;
      }
      pendingCrewStation = null;
      activeCrewStation = station; enteringCrewStation = station;
      try { return originalOnStation?.(station); } finally { enteringCrewStation = null; }
    },
  };

  THREE.Scene.prototype.add = function captureCabinScene(...objects) { scene ||= this; return originalSceneAdd.apply(this, objects); };
  let core;
  try { core = createCabinViewCore(canvas, gatedOptions); } finally { THREE.Scene.prototype.add = originalSceneAdd; }
  if (!scene) throw new Error('Cabin scene was not created');
  const crewVisuals = createCabinCrewVisualLayer(scene, { capacity: 2 });
  const loaderVisual = createLoaderArmVisual(scene);
  const hullImpactVisual = createHullImpactVisual(scene, { reducedMotion });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const safeDt = value => Math.min(.1, Math.max(0, Number(value) || 0));

  function updateRemoteCrew(remotes = [], dt = 0) { return crewVisuals.update(remotes, 1, safeDt(dt)); }
  function publishMaintenance(engine) {
    const detail = maintenanceFeedback(engine);
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:maintenance-feedback', { detail })); } catch {}
    return detail;
  }
  function clearMaintenance() { try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:maintenance-feedback', { detail: { active: false } })); } catch {} }

  function applyHullImpact(feedback) {
    if (!feedback?.active) return;
    remoteImpact = Math.max(remoteImpact, feedback.intensity);
    hullImpactVisual.kick(feedback);
  }

  function onLocalHullImpact(event) {
    applyHullImpact(hullImpactFeedback(event?.detail || {}));
  }

  function onSharedCrewEffect(event) {
    const effect = event.detail || {};
    if (!effect.remote) return;
    if (effect.type === 'fire') { remoteRecoil = Math.max(remoteRecoil, 1); remoteImpact = Math.max(remoteImpact, .45); }
    if (effect.type === 'reload') {
      const shell = ['HE','FRAG','SMOKE'].includes(effect.payload?.shell) ? effect.payload.shell : 'HE';
      remoteLoading = beginLoading(shell, shell);
    }
    if (effect.type === 'impact' || effect.type === 'critical') {
      applyHullImpact(remoteHullImpactFeedback(effect));
    }
  }
  globalThis.addEventListener?.('ironrain:mamute-impact', onLocalHullImpact);
  globalThis.addEventListener?.('ironrain:shared-crew-effect', onSharedCrewEffect);

  function cancelPendingCrewStation() {
    if (!pendingCrewStation) return true;
    const station = pendingCrewStation;
    if (!releaseCrewStation(station)) return false;
    pendingCrewStation = null;
    return true;
  }

  function leaveCrewStation() {
    if (activeCrewStation && enteringCrewStation !== activeCrewStation) {
      if (!releaseCrewStation(activeCrewStation)) return false;
      activeCrewStation = null;
    }
    return core.leaveStation?.();
  }

  function runPointerUnlockCleanup() {
    try { originalOnPointerUnlock?.(); } catch {}
  }

  function quiesceTransientCabinVfx() {
    remoteRecoil = 0;
    remoteImpact = 0;
    hullImpactVisual.reset();
    canvas.style.transform = '';
    canvas.style.filter = '';
  }

  function releaseCrewStationsForBackground() {
    quiesceTransientCabinVfx();
    cancelPendingCrewStation();
    if (activeCrewStation && leaveCrewStation() !== false) runPointerUnlockCleanup();
  }
  function onVisibilityChange() {
    if (globalThis.document?.visibilityState !== 'hidden') return;
    releaseCrewStationsForBackground();
  }
  function onPageHide() { releaseCrewStationsForBackground(); }
  globalThis.document?.addEventListener?.('visibilitychange', onVisibilityChange);
  globalThis.addEventListener?.('pagehide', onPageHide);

  function reconcileCrewStation() {
    if (!activeCrewStation || enteringCrewStation === activeCrewStation) return true;
    const station = activeCrewStation;
    const bridge = crewBridge();
    let state = null;
    if (bridge?.stationState) {
      try { state = bridge.stationState(station); } catch { state = null; }
    }
    if (state?.ready) return true;

    activeCrewStation = null;
    stationResultEvent(state || { ok: false, ready: false, pending: false, reason: bridge ? 'claim-failed' : 'authority-unavailable', station });
    core.leaveStation?.();
    // Reuse the existing parent cleanup seam so gameplay/UI state cannot remain
    // seated after the crew authority has already ejected the rendered cabin.
    runPointerUnlockCleanup();
    return false;
  }

  view = {
    ...core,
    leaveStation: leaveCrewStation,
    update(dt, data = {}) {
      reconcileCrewStation();
      const elapsed = safeDt(dt);
      if (remoteLoading) { stepLoading(remoteLoading, elapsed); if (remoteLoading.complete) remoteLoading = null; }
      remoteRecoil = Math.max(0, remoteRecoil - elapsed * 2.2);
      remoteImpact = Math.max(0, remoteImpact - elapsed * 2.8);
      hullImpactVisual.update(elapsed);
      const merged = { ...data };
      if (!merged.loading && remoteLoading) merged.loading = remoteLoading;
      merged.recoil = Math.max(Number(merged.recoil) || 0, remoteRecoil);
      loaderVisual.update(merged.loading);
      // The live crew-aware renderer owns loading presentation now. Suppress the
      // legacy free-floating transfer round in cabin-view-core while preserving
      // shell selection/readouts and the single canonical loading clock.
      const liveLoading = merged.loading;
      if (liveLoading) merged.loading = null;
      core.update(dt, merged);
      if (liveLoading) merged.loading = liveLoading;
      const shake = reducedMotion ? 0 : Math.max(remoteRecoil * 2.4, remoteImpact * 4.2);
      if (shake > .05) {
        const t = performance.now() * .055;
        canvas.style.transform = `translate(${Math.sin(t) * shake}px,${Math.cos(t * 1.37) * shake * .55}px)`;
      } else { canvas.style.transform = ''; }
      canvas.style.filter = remoteImpact > .65 ? `brightness(${1 + remoteImpact * .16})` : '';
      if (own(data, 'engine')) publishMaintenance(data.engine);
      if (own(data, 'crewRemotes')) updateRemoteCrew(data.crewRemotes, dt);
    },
    updateRemoteCrew,
    crewStation() { return activeCrewStation; },
    reset() {
      if (pendingCrewStation) releaseCrewStation(pendingCrewStation);
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = pendingCrewStation = enteringCrewStation = null; remoteLoading = null; remoteRecoil = remoteImpact = 0;
      canvas.style.transform = ''; canvas.style.filter = '';
      hullImpactVisual.reset(); loaderVisual.update(null); clearMaintenance(); core.reset(); crewVisuals.clear();
    },
    snapshot() { return { ...core.snapshot(), crewStation: activeCrewStation, pendingCrewStation, crew: crewVisuals.snapshot(), loader: loaderVisual.snapshot(), hullImpact: hullImpactVisual.snapshot(), remoteLoading: remoteLoading ? { ...remoteLoading } : null }; },
    dispose() {
      if (pendingCrewStation) releaseCrewStation(pendingCrewStation);
      if (activeCrewStation) releaseCrewStation(activeCrewStation);
      activeCrewStation = pendingCrewStation = enteringCrewStation = null;
      globalThis.removeEventListener?.('ironrain:mamute-impact', onLocalHullImpact);
      globalThis.removeEventListener?.('ironrain:shared-crew-effect', onSharedCrewEffect);
      globalThis.removeEventListener?.('pagehide', onPageHide);
      globalThis.document?.removeEventListener?.('visibilitychange', onVisibilityChange);
      canvas.style.transform = ''; canvas.style.filter = '';
      clearMaintenance(); hullImpactVisual.dispose(); loaderVisual.dispose(); crewVisuals.dispose(); core.dispose();
    },
  };

  try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:cabin-ready', { detail: { cabin: view } })); } catch {}
  return view;
}
