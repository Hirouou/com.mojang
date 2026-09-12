import * as THREE from '../vendor/three.module.min.js';
import { createCabinView as createCabinViewCore } from './cabin-view-core.js';
import { createCabinCrewVisualLayer } from './crew-visual-layer.js';

/**
 * Public cabin renderer with the remote-crew visual layer attached.
 * Networking/session ownership stays outside: callers feed renderer-ready
 * samples from crew-runtime/crew-replication through updateRemoteCrew() or
 * the optional crewRemotes field accepted by update().
 */
export function createCabinView(canvas, options = {}) {
  let scene = null;
  const originalSceneAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function captureCabinScene(...objects) {
    scene ||= this;
    return originalSceneAdd.apply(this, objects);
  };

  let core;
  try {
    core = createCabinViewCore(canvas, options);
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

  return {
    ...core,
    update(dt, data = {}) {
      core.update(dt, data);
      if (own(data, 'crewRemotes')) updateRemoteCrew(data.crewRemotes, dt);
    },
    updateRemoteCrew,
    reset() {
      core.reset();
      crewVisuals.clear();
    },
    snapshot() {
      return { ...core.snapshot(), crew: crewVisuals.snapshot() };
    },
    dispose() {
      crewVisuals.dispose();
      core.dispose();
    },
  };
}
