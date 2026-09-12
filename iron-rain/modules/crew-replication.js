import { cabinCrewPose } from './cabin-controls.js';

/**
 * Transport-agnostic replication state for one Mamute crew.
 * The session is capped at three people total: one local player + two remotes.
 * Sockets/WebRTC never enter this module; callers feed timestamped packets and
 * consume renderer-ready from/to samples.
 */
export function createCrewReplication({ localId = 'local', capacity = 3, staleAfter = 5 } = {}) {
  const totalCapacity = Math.max(1, Math.min(3, Number.isFinite(capacity) ? Math.floor(capacity) : 3));
  const remoteCapacity = Math.max(0, totalCapacity - 1);
  const staleSeconds = Math.max(.5, Number.isFinite(staleAfter) ? staleAfter : 5);
  const remotes = new Map();
  let localSequence = 0;

  const normalizeId = id => (typeof id === 'string' || typeof id === 'number') && String(id).length ? String(id) : null;
  const nowValue = value => Number.isFinite(value) ? value : 0;

  function localPacket(pose, at = 0) {
    const safe = cabinCrewPose(pose);
    if (!safe) return null;
    localSequence += 1;
    return Object.freeze({
      kind: 'crew-pose',
      id: String(localId),
      seq: localSequence,
      at: nowValue(at),
      pose: safe,
    });
  }

  function receive(packet) {
    if (!packet || packet.kind !== 'crew-pose') return false;
    const id = normalizeId(packet.id);
    if (!id || id === String(localId)) return false;
    const pose = cabinCrewPose(packet.pose);
    const seq = Number(packet.seq);
    const at = nowValue(packet.at);
    if (!pose || !Number.isFinite(seq) || seq < 0) return false;

    const current = remotes.get(id);
    if (!current && remotes.size >= remoteCapacity) return false;
    if (current && seq <= current.seq) return false;

    remotes.set(id, {
      id,
      seq,
      previousAt: current?.at ?? at - .1,
      at,
      from: current?.to || pose,
      to: pose,
      receivedAt: at,
    });
    return true;
  }

  function prune(now = 0) {
    const t = nowValue(now);
    for (const [id, entry] of remotes) if (t - entry.receivedAt > staleSeconds) remotes.delete(id);
  }

  function renderSamples(now = 0, interpolationDelay = .1) {
    prune(now);
    const t = nowValue(now), delay = Math.max(0, Number.isFinite(interpolationDelay) ? interpolationDelay : .1);
    return Object.freeze([...remotes.values()].map(entry => {
      const span = Math.max(.001, entry.at - entry.previousAt);
      // Late packets are intentionally clamped instead of extrapolated through
      // cabin equipment. crew-presence performs the final collision-safe blend.
      const alpha = Math.max(0, Math.min(1, (t - delay - entry.previousAt) / span));
      return Object.freeze({ id: entry.id, from: entry.from, to: entry.to, alpha, seq: entry.seq, at: entry.at });
    }));
  }

  function snapshot() {
    return Object.freeze({
      localId: String(localId),
      capacity: totalCapacity,
      remoteCapacity,
      remotes: Object.freeze([...remotes.values()].map(entry => Object.freeze({ id: entry.id, seq: entry.seq, at: entry.at, pose: entry.to }))),
    });
  }

  return Object.freeze({
    localPacket,
    receive,
    renderSamples,
    snapshot,
    remove(id) { remotes.delete(String(id)); },
    clear() { remotes.clear(); },
    get capacity() { return totalCapacity; },
    get remoteCapacity() { return remoteCapacity; },
  });
}
