import { cabinCrewPose, interpolateCabinCrewPose } from './cabin-controls.js';

/**
 * Renderer-facing state for at most two remote crew members.
 * Networking/authority stays outside this module; it only validates and smooths
 * poses that are safe to show inside the current Mamute interior.
 */
export function createCabinCrewPresence({ capacity = 2 } = {}) {
  const max = Math.max(0, Math.min(2, Number.isFinite(capacity) ? Math.floor(capacity) : 2));
  const lastValid = new Map();
  let visible = Object.freeze([]);

  const validId = id => (typeof id === 'string' || typeof id === 'number') && String(id).length > 0;
  const immutableEntry = (id, pose) => Object.freeze({ id, pose });

  function update(remotes = [], alpha = 1) {
    if (!Array.isArray(remotes)) remotes = [];
    const next = [];
    const seen = new Set();

    for (const remote of remotes) {
      if (next.length >= max || !remote || !validId(remote.id) || seen.has(remote.id)) continue;
      seen.add(remote.id);

      let pose = null;
      if (remote.pose) pose = cabinCrewPose(remote.pose);
      else if (remote.from || remote.to) pose = interpolateCabinCrewPose(remote.from, remote.to, alpha);

      // A rejected midpoint can happen when two valid network samples straddle
      // solid equipment. Keep the last drawable pose instead of clipping or
      // teleporting the avatar through the cabin.
      if (!pose) pose = lastValid.get(remote.id) || null;
      if (!pose) continue;

      lastValid.set(remote.id, pose);
      next.push(immutableEntry(remote.id, pose));
    }

    // Peers omitted from the current remote set are hidden immediately, but the
    // last validated pose remains cached so a later blocked interpolation can
    // resume without a visual jump.
    visible = Object.freeze(next);
    return visible;
  }

  return Object.freeze({
    update,
    clear(id) {
      if (id === undefined) lastValid.clear();
      else lastValid.delete(id);
      visible = Object.freeze(visible.filter(entry => id === undefined || entry.id !== id));
    },
    snapshot() { return visible; },
    get capacity() { return max; },
  });
}
