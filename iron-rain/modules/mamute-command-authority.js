import { canFireShell, consumeShell } from './mamute-logistics.js';

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
const FIRE_REPLAY_WINDOW = 128;

/**
 * Validates multiplayer commands against current physical-station ownership.
 * This is the boundary that lets one crew member drive while another aims/fires
 * without either client being allowed to issue commands from the other's post.
 *
 * When fireInventory is supplied, fire reserves exactly one shell from the
 * canonical Mamute inventory before apply() can commit the shot. Rejected shots
 * restore that reservation so an accepted shot cannot exist without ammo.
 */
export function createMamuteCommandAuthority({
  stationOwner = () => null,
  apply = () => true,
  fireInventory = null,
} = {}) {
  const sequences = new Map();
  const acceptedFireShots = new Set();
  const acceptedFireOrder = [];
  let accepted = 0, rejected = 0;

  function fireShotKey(playerId, payload) {
    const shotId = cleanId(payload?.shotId);
    return shotId ? `${playerId}:${shotId}` : null;
  }

  function rememberFireShot(key) {
    if (!key) return;
    acceptedFireShots.add(key);
    acceptedFireOrder.push(key);
    while (acceptedFireOrder.length > FIRE_REPLAY_WINDOW) acceptedFireShots.delete(acceptedFireOrder.shift());
  }

  function currentFireInventory() {
    try { return typeof fireInventory === 'function' ? fireInventory() : fireInventory; } catch { return null; }
  }

  function restoreShell(inventory, shell) {
    if (!inventory?.shells || typeof inventory.shells[shell] !== 'number') return;
    const capacity = Number(inventory.capacity?.[shell]);
    inventory.shells[shell] = Number.isFinite(capacity)
      ? Math.min(capacity, inventory.shells[shell] + 1)
      : inventory.shells[shell] + 1;
  }

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
    const shotId = type === 'fire' ? cleanId(command.payload?.shotId) : null;
    const shotKey = type === 'fire' ? fireShotKey(playerId, command.payload) : null;
    if (shotKey && acceptedFireShots.has(shotKey)) {
      sequences.set(playerId, seq);
      rejected += 1;
      return Object.freeze({ ok: false, reason: 'duplicate-shot', station, owner, shotId });
    }

    const inventory = type === 'fire' ? currentFireInventory() : null;
    const shell = type === 'fire' ? command.payload?.shell : null;
    let shellReserved = false;
    if (inventory) {
      if (!canFireShell(inventory, shell)) {
        rejected += 1;
        return Object.freeze({ ok: false, reason: 'out-of-ammo', station, owner, shell: shell || null, ...(shotId ? { shotId } : {}) });
      }
      shellReserved = consumeShell(inventory, shell, 1);
      if (!shellReserved) {
        rejected += 1;
        return Object.freeze({ ok: false, reason: 'ammo-consume-failed', station, owner, shell: shell || null, ...(shotId ? { shotId } : {}) });
      }
    }

    let applied = false;
    try { applied = apply(Object.freeze({ playerId, seq, type, station, payload: command.payload ?? null })) !== false; } catch { applied = false; }
    if (!applied) {
      if (shellReserved) restoreShell(inventory, shell);
      rejected += 1;
      return Object.freeze({ ok: false, reason: 'command-rejected', station, owner, ...(shotId ? { shotId } : {}) });
    }

    if (shotKey) rememberFireShot(shotKey);
    sequences.set(playerId, seq); accepted += 1;
    const ammoRemaining = inventory ? inventory.shells?.[shell] : undefined;
    return Object.freeze({ ok: true, station, owner, accepted, ...(shotId ? { shotId } : {}), ...(inventory ? { shell, ammoRemaining } : {}) });
  }

  return Object.freeze({
    receive,
    resetPlayer(playerId) { sequences.delete(String(playerId)); },
    snapshot() { return Object.freeze({ accepted, rejected, sequences: Object.freeze([...sequences.entries()].map(([id, seq]) => Object.freeze({ id, seq }))) }); },
  });
}