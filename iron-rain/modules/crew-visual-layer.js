import { createCabinCrewPresence } from './crew-presence.js';
import { createCabinCrewAvatars } from './crew-avatar-visual.js';

/**
 * Small renderer bridge for remote crew inside the Mamute.
 * Network samples stay outside this layer: it only validates/interpolates them
 * through crew-presence and feeds the preallocated low-poly avatar pool.
 */
export function createCabinCrewVisualLayer(scene, { capacity = 2, palettes } = {}) {
  const presence = createCabinCrewPresence({ capacity });
  const avatars = createCabinCrewAvatars(scene, { capacity: presence.capacity, palettes });
  let remoteIds = new Set();

  function update(remotes = [], alpha = 1, dt = 0) {
    const list = Array.isArray(remotes) ? remotes : [];
    const nextIds = new Set(list
      .filter(remote => remote && (typeof remote.id === 'string' || typeof remote.id === 'number') && String(remote.id).length)
      .map(remote => remote.id));

    // Omission means the renderer-facing replication set no longer owns that
    // peer (pruned/disconnected). Drop its cached fallback so a later session
    // reusing the same id cannot resurrect an old cabin position when its first
    // interpolation happens to cross solid equipment.
    for (const id of remoteIds) if (!nextIds.has(id)) presence.clear(id);
    remoteIds = nextIds;

    const visible = presence.update(list, alpha);
    return avatars.update(visible, dt);
  }

  function clear(id) {
    presence.clear(id);
    if (id === undefined) remoteIds.clear();
    else remoteIds.delete(id);
    avatars.update(presence.snapshot(), 0);
  }

  function dispose() {
    presence.clear();
    remoteIds.clear();
    avatars.dispose();
  }

  return Object.freeze({
    update,
    clear,
    dispose,
    snapshot: avatars.snapshot,
    presenceSnapshot: presence.snapshot,
    capacity: presence.capacity,
  });
}
