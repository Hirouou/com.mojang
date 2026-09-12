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

  function update(remotes = [], alpha = 1, dt = 0) {
    const visible = presence.update(remotes, alpha);
    return avatars.update(visible, dt);
  }

  function clear(id) {
    presence.clear(id);
    avatars.update(presence.snapshot(), 0);
  }

  function dispose() {
    presence.clear();
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
