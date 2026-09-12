export const MAMUTE_COMMAND_STATION = Object.freeze({
  'drive-vector': 'drive',
  'drive-stop': 'drive',
  'aim-delta': 'aim',
  fire: 'aim',
  'change-charge': 'aim',
  'select-shell': 'load',
  'reload-shell': 'load',
  'engine-service': 'engine',
  'use-extinguisher': 'extinguisher',
});

const cleanId = value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null;
const cleanType = value => MAMUTE_COMMAND_STATION[String(value)] ? String(value) : null;

/**
 * Validates multiplayer commands against current physical-station ownership.
 * This is the boundary that lets one crew member drive while another aims/fires
 * without either client being allowed to issue commands from the other's post.
 */
export function createMamuteCommandAuthority({
  stationOwner = () => null,
  apply = () => true,
} = {}) {
  const sequences = new Map();
  let accepted = 0, rejected = 0;

  function receive(command) {
    const playerId = cleanId(command?.playerId ?? command?.sender);
    const type = cleanType(command?.type);
    const seq = Number(command?.seq);
    if (!playerId || !type || !Number.isFinite(seq) || seq < 0) {
      rejected += 1; return Object.freeze({ ok: false, reason: 'invalid-command' });
    }
    const last = sequences.get(playerId) ?? -1;
    if (seq <= last) { rejected += 1; return Object.freeze({ ok: false, reason: 'stale-command' }); }
    const station = MAMUTE_COMMAND_STATION[type];
    const owner = stationOwner(station);
    if (owner !== playerId) {
      rejected += 1;
      return Object.freeze({ ok: false, reason: owner ? 'station-owned-by-other' : 'station-not-claimed', station, owner: owner || null });
    }
    let applied = false;
    try { applied = apply(Object.freeze({ playerId, seq, type, station, payload: command.payload ?? null })) !== false; } catch { applied = false; }
    if (!applied) { rejected += 1; return Object.freeze({ ok: false, reason: 'command-rejected', station, owner }); }
    sequences.set(playerId, seq); accepted += 1;
    return Object.freeze({ ok: true, station, owner, accepted });
  }

  return Object.freeze({
    receive,
    resetPlayer(playerId) { sequences.delete(String(playerId)); },
    snapshot() { return Object.freeze({ accepted, rejected, sequences: Object.freeze([...sequences.entries()].map(([id, seq]) => Object.freeze({ id, seq }))) }); },
  });
}
