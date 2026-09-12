import { crewLocalPoseFromCabinSnapshot } from './crew-local-pose.js';
import { releaseStationGate, requestStationGate, stationGateMessage, stationGateState } from './crew-station-gate.js';

const clampDelay = value => Math.max(0, Number.isFinite(value) ? value : .1);
const clampDt = value => Math.min(.1, Math.max(0, Number(value) || 0));
const stationDenial = (runtime, station) => {
  let status = null;
  try { status = runtime?.status?.() || null; } catch { status = null; }
  const event = String(status?.lastEvent || '');
  const prefix = `station-denied:${station}`;
  if (event !== prefix && !event.startsWith(`${prefix}:`)) return null;
  const owner = event.slice(prefix.length + 1).trim() || null;
  return Object.freeze({ owner });
};

/**
 * Frame-level boundary between the Mamute cabin and crew runtime.
 *
 * The renderer stays transport-agnostic: this bridge publishes only the
 * compact collision-safe local crew pose and feeds renderer-ready remote
 * samples back into cabin-view. Station interaction also crosses this same
 * boundary so cabin input never needs to know about session packets or
 * transport authority.
 */
export function createCrewCabinBridge({ runtime, cabin, interpolationDelay = .1 } = {}) {
  const delay = clampDelay(interpolationDelay);
  const pendingStations = new Set();

  function update(dt = 0, at) {
    const localPose = crewLocalPoseFromCabinSnapshot(cabin?.snapshot?.());
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
    pendingStations.clear();
    cabin?.updateRemoteCrew?.([], 0);
  }

  function stationState(station) {
    const state = stationGateState(runtime, station);
    const id = state.station;
    if (!id) return state;
    if (state.ready || state.reason !== 'available') {
      pendingStations.delete(id);
      return state;
    }
    if (pendingStations.has(id)) {
      const denied = stationDenial(runtime, id);
      if (denied) {
        pendingStations.delete(id);
        return Object.freeze({
          ...state,
          ok: false,
          pending: false,
          reason: denied.owner ? 'occupied' : 'claim-denied',
          owner: denied.owner,
        });
      }
      return Object.freeze({ ...state, ok: false, pending: true, reason: 'pending-host' });
    }
    return state;
  }

  function requestStation(station) {
    const current = stationState(station);
    if (current.pending || current.ready || (!current.ok && current.reason !== 'available')) return current;
    const result = requestStationGate(runtime, station);
    if (result?.station) {
      if (result.pending) pendingStations.add(result.station);
      else pendingStations.delete(result.station);
    }
    return result;
  }

  function releaseStation(station) {
    if (typeof station === 'string') pendingStations.delete(station);
    return releaseStationGate(runtime, station);
  }

  return Object.freeze({
    update,
    clear,
    stationState,
    requestStation,
    releaseStation,
    stationMessage: result => stationGateMessage(result),
    interpolationDelay: delay,
  });
}
