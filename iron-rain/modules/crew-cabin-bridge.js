const clampDelay = value => Math.max(0, Number.isFinite(value) ? value : .1);
const clampDt = value => Math.min(.1, Math.max(0, Number(value) || 0));

/**
 * Frame-level boundary between the Mamute cabin and crew runtime.
 *
 * The renderer stays transport-agnostic: this bridge only publishes the local
 * cabin pose to the runtime and feeds renderer-ready remote samples back into
 * cabin-view. The game loop owns when this runs and which transport/runtime is
 * active.
 */
export function createCrewCabinBridge({ runtime, cabin, interpolationDelay = .1 } = {}) {
  const delay = clampDelay(interpolationDelay);

  function update(dt = 0, at) {
    const localPose = cabin?.snapshot?.();
    if (!localPose || typeof runtime?.update !== 'function' || typeof runtime?.renderSamples !== 'function' || typeof cabin?.updateRemoteCrew !== 'function') {
      cabin?.updateRemoteCrew?.([], clampDt(dt));
      return Object.freeze({ status: null, remoteCount: 0 });
    }

    const status = at === undefined ? runtime.update(localPose) : runtime.update(localPose, at);
    const remotes = at === undefined
      ? runtime.renderSamples(undefined, delay)
      : runtime.renderSamples(at, delay);
    const list = Array.isArray(remotes) ? remotes : [];
    cabin.updateRemoteCrew(list, clampDt(dt));
    return Object.freeze({ status, remoteCount: list.length });
  }

  function clear() {
    cabin?.updateRemoteCrew?.([], 0);
  }

  return Object.freeze({ update, clear, interpolationDelay: delay });
}
