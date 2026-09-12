import { CABIN_STATIONS } from './cabin-controls.js';

const VALID_STATIONS = new Set(CABIN_STATIONS.map(station => station.id));
const cleanStation = station => typeof station === 'string' && VALID_STATIONS.has(station) ? station : null;

/**
 * Renderer/input-facing station ownership seam.
 *
 * This module does not create authority. It only translates the canonical
 * crew-runtime station API into a small state machine that cabin interaction
 * code can consume without knowing about session packets or transports.
 */
export function stationGateState(runtime, station) {
  const id = cleanStation(station);
  if (!id) return Object.freeze({ ok: false, ready: false, pending: false, reason: 'invalid-station', station: null, owner: null });
  if (!runtime) return Object.freeze({ ok: true, ready: true, pending: false, reason: 'single-player', station: id, owner: null });

  let status = null;
  let owner = null;
  try { status = runtime.status?.() || null; } catch { status = null; }
  try { owner = runtime.stationOwner?.(id) ?? null; } catch { owner = null; }
  const localId = status?.localId ?? status?.session?.localId ?? null;

  if (owner != null && localId != null && String(owner) === String(localId)) {
    return Object.freeze({ ok: true, ready: true, pending: false, reason: 'owned', station: id, owner });
  }
  if (owner != null) {
    return Object.freeze({ ok: false, ready: false, pending: false, reason: 'occupied', station: id, owner });
  }
  if (status?.mode === 'guest' && !status?.connected) {
    return Object.freeze({ ok: false, ready: false, pending: false, reason: 'not-connected', station: id, owner: null });
  }
  return Object.freeze({ ok: true, ready: false, pending: false, reason: 'available', station: id, owner: null });
}

export function requestStationGate(runtime, station) {
  const before = stationGateState(runtime, station);
  if (!before.ok && before.reason !== 'available') return before;
  if (before.ready || before.reason === 'single-player') return before;
  if (!runtime?.claimStation) return Object.freeze({ ...before, ok: false, reason: 'authority-unavailable' });

  let result;
  try { result = runtime.claimStation(before.station); }
  catch { return Object.freeze({ ...before, ok: false, reason: 'claim-failed' }); }

  if (result?.ok) {
    return Object.freeze({ ok: true, ready: true, pending: false, reason: result.reason || 'claimed', station: before.station, owner: result.owner ?? runtime.status?.()?.localId ?? null });
  }
  if (result?.pending) {
    return Object.freeze({ ok: false, ready: false, pending: true, reason: result.reason || 'pending-host', station: before.station, owner: result.owner ?? null });
  }
  return Object.freeze({ ok: false, ready: false, pending: false, reason: result?.reason || 'claim-denied', station: before.station, owner: result?.owner ?? null });
}

export function releaseStationGate(runtime, station) {
  const id = cleanStation(station);
  if (!id) return false;
  if (!runtime) return true;
  if (typeof runtime.releaseStation !== 'function') return false;
  try { return Boolean(runtime.releaseStation(id)); }
  catch { return false; }
}

export function stationGateMessage(result) {
  const reason = result?.reason;
  if (reason === 'occupied') return 'POSTO OCUPADO POR OUTRO TRIPULANTE';
  if (reason === 'pending-host') return 'AGUARDANDO CONFIRMAÇÃO DO POSTO';
  if (reason === 'not-connected') return 'TRIPULAÇÃO DESCONECTADA';
  if (reason === 'faction-mismatch') return 'ESTE MAMUTE PERTENCE À OUTRA FACÇÃO';
  if (reason === 'invalid-station') return 'POSTO INVÁLIDO';
  if (reason === 'claim-failed' || reason === 'claim-denied' || reason === 'authority-unavailable') return 'POSTO INDISPONÍVEL';
  return '';
}
