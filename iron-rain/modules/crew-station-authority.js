export const CREW_EXCLUSIVE_STATIONS = Object.freeze([
  'drive', 'aim', 'load', 'map', 'radio', 'engine', 'extinguisher'
]);

const stationSet = new Set(CREW_EXCLUSIVE_STATIONS);
const cleanId = value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null;
const cleanStation = value => stationSet.has(String(value)) ? String(value) : null;

/**
 * Exclusive physical-station ownership mirrored from the shared Mamute authority.
 * Exactly one crew member can own a physical station/control surface at a time.
 * Walking around remains shared; only machine interaction is locked.
 */
export function createCrewStationAuthority() {
  const claims = new Map();
  let revision = 0;

  const snapshot = () => Object.freeze({
    revision,
    claims: Object.freeze([...claims.entries()].map(([station, owner]) => Object.freeze({ station, owner }))),
  });

  function ownerOf(station) {
    const key = cleanStation(station);
    return key ? claims.get(key) || null : null;
  }

  function canUse(station, playerId) {
    const key = cleanStation(station), id = cleanId(playerId);
    if (!key || !id) return false;
    const owner = claims.get(key);
    return !owner || owner === id;
  }

  function claim(station, playerId) {
    const key = cleanStation(station), id = cleanId(playerId);
    if (!key || !id) return Object.freeze({ ok: false, reason: 'invalid', station: key, owner: null, revision });
    const owner = claims.get(key);
    if (owner && owner !== id) return Object.freeze({ ok: false, reason: 'occupied', station: key, owner, revision });
    if (owner === id) return Object.freeze({ ok: true, reason: 'already-owned', station: key, owner: id, revision });
    claims.set(key, id); revision += 1;
    return Object.freeze({ ok: true, reason: 'claimed', station: key, owner: id, revision });
  }

  function release(station, playerId) {
    const key = cleanStation(station), id = cleanId(playerId);
    if (!key || !id) return false;
    if (claims.get(key) !== id) return false;
    claims.delete(key); revision += 1;
    return true;
  }

  function releaseAll(playerId) {
    const id = cleanId(playerId);
    if (!id) return 0;
    let released = 0;
    for (const [station, owner] of [...claims]) if (owner === id) {
      claims.delete(station); released += 1;
    }
    if (released) revision += 1;
    return released;
  }

  function clear() {
    if (!claims.size) return false;
    claims.clear(); revision += 1; return true;
  }

  function apply(authoritative) {
    const nextRevision = Number(authoritative?.revision);
    if (!Number.isFinite(nextRevision) || nextRevision < revision || !Array.isArray(authoritative?.claims)) return false;
    const next = new Map();
    for (const entry of authoritative.claims) {
      const station = cleanStation(entry?.station), owner = cleanId(entry?.owner);
      if (!station || !owner || next.has(station)) continue;
      next.set(station, owner);
    }
    if (nextRevision === revision) {
      if (next.size !== claims.size) return false;
      for (const [station, owner] of next) if (claims.get(station) !== owner) return false;
      return true;
    }
    claims.clear();
    for (const [station, owner] of next) claims.set(station, owner);
    revision = nextRevision;
    return true;
  }

  return Object.freeze({
    claim, release, releaseAll, clear, apply, snapshot, ownerOf, canUse,
    stations: CREW_EXCLUSIVE_STATIONS,
  });
}
