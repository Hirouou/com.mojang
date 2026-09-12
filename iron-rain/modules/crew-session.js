import { createCrewReplication } from './crew-replication.js';

export const CREW_PROTOCOL = 1;
export const CREW_MAX_PLAYERS = 3;
export const CREW_POSE_HZ = 12;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const cleanId = value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null;
const cleanRoom = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);

/**
 * Transport-agnostic multiplayer session for one Mamute.
 *
 * Host authority lives here, while sockets/WebRTC/BroadcastChannel live outside.
 * The host occupies seat 0 and can admit at most two guests (seats 1 and 2).
 * Only compact validated crew poses are replicated; remote input never reaches
 * the local movement/camera controller.
 */
export function createCrewSession({
  localId = 'local',
  send = () => {},
  now = () => performance.now() / 1000,
  staleAfter = 6,
} = {}) {
  const id = cleanId(localId) || 'local';
  const replication = createCrewReplication({ localId: id, capacity: CREW_MAX_PLAYERS, staleAfter });
  const peers = new Map();
  let mode = 'offline';
  let room = '';
  let seat = 0;
  let hostId = null;
  let nextPoseAt = 0;
  let lastHelloAt = -Infinity;
  let lastHeartbeatAt = -Infinity;
  let lastEvent = 'offline';

  const emit = payload => {
    const packet = Object.freeze({ ...payload, protocol: CREW_PROTOCOL, room, sender: id, sentAt: finite(now()) });
    try { send(packet); } catch { /* transport loss must not break gameplay */ }
    return packet;
  };

  function peerList() {
    return Object.freeze([...peers.values()].sort((a, b) => a.seat - b.seat).map(peer => Object.freeze({ ...peer })));
  }

  function status() {
    return Object.freeze({
      mode,
      room,
      localId: id,
      hostId,
      seat,
      connected: mode === 'host' || (mode === 'guest' && seat > 0),
      count: mode === 'offline' ? 1 : 1 + peers.size,
      capacity: CREW_MAX_PLAYERS,
      peers: peerList(),
      lastEvent,
    });
  }

  function reset(nextMode = 'offline', nextRoom = '') {
    peers.clear();
    replication.clear();
    mode = nextMode;
    room = cleanRoom(nextRoom);
    seat = nextMode === 'host' ? 0 : -1;
    hostId = nextMode === 'host' ? id : null;
    nextPoseAt = 0;
    lastHelloAt = lastHeartbeatAt = -Infinity;
    lastEvent = nextMode;
  }

  function host(roomCode) {
    reset('host', roomCode);
    if (!room) throw new RangeError('room code required');
    lastEvent = 'hosting';
    emit({ kind: 'crew-host-open', seat: 0, capacity: CREW_MAX_PLAYERS });
    return status();
  }

  function join(roomCode) {
    reset('guest', roomCode);
    if (!room) throw new RangeError('room code required');
    lastEvent = 'joining';
    emit({ kind: 'crew-hello', requestedSeat: null });
    lastHelloAt = finite(now());
    return status();
  }

  function leave(reason = 'left') {
    if (mode !== 'offline' && room) emit({ kind: 'crew-leave', reason: String(reason).slice(0, 48), seat });
    reset();
    return status();
  }

  function allocateSeat() {
    const used = new Set([0, ...[...peers.values()].map(peer => peer.seat)]);
    for (const candidate of [1, 2]) if (!used.has(candidate)) return candidate;
    return null;
  }

  function acceptHello(packet, at) {
    if (mode !== 'host') return false;
    const peerId = cleanId(packet.sender);
    if (!peerId || peerId === id) return false;
    const existing = peers.get(peerId);
    const assignedSeat = existing?.seat ?? allocateSeat();
    if (assignedSeat == null) {
      emit({ kind: 'crew-deny', target: peerId, reason: 'mamute-full' });
      lastEvent = 'join-denied-full';
      return true;
    }
    peers.set(peerId, { id: peerId, seat: assignedSeat, lastSeen: at });
    emit({ kind: 'crew-welcome', target: peerId, hostId: id, seat: assignedSeat, capacity: CREW_MAX_PLAYERS, members: peerList() });
    emit({ kind: 'crew-members', members: peerList() });
    lastEvent = `joined:${peerId}`;
    return true;
  }

  function acceptWelcome(packet, at) {
    if (mode !== 'guest' || cleanId(packet.target) !== id) return false;
    const assignedSeat = Number(packet.seat);
    if (![1, 2].includes(assignedSeat)) return false;
    hostId = cleanId(packet.hostId) || cleanId(packet.sender);
    seat = assignedSeat;
    peers.clear();
    const members = Array.isArray(packet.members) ? packet.members : [];
    for (const member of members) {
      const peerId = cleanId(member?.id);
      const peerSeat = Number(member?.seat);
      if (!peerId || peerId === id || ![0, 1, 2].includes(peerSeat)) continue;
      peers.set(peerId, { id: peerId, seat: peerSeat, lastSeen: at });
    }
    if (hostId && hostId !== id && !peers.has(hostId)) peers.set(hostId, { id: hostId, seat: 0, lastSeen: at });
    lastEvent = 'joined';
    return true;
  }

  function acceptMembers(packet, at) {
    if (mode !== 'guest' || seat < 0) return false;
    const members = Array.isArray(packet.members) ? packet.members : [];
    const keep = new Set();
    for (const member of members) {
      const peerId = cleanId(member?.id);
      const peerSeat = Number(member?.seat);
      if (!peerId || peerId === id || ![0, 1, 2].includes(peerSeat)) continue;
      keep.add(peerId);
      peers.set(peerId, { id: peerId, seat: peerSeat, lastSeen: at });
    }
    if (hostId && hostId !== id) {
      keep.add(hostId);
      const current = peers.get(hostId);
      peers.set(hostId, { id: hostId, seat: 0, lastSeen: current?.lastSeen ?? at });
    }
    for (const peerId of [...peers.keys()]) if (!keep.has(peerId)) { peers.delete(peerId); replication.remove(peerId); }
    return true;
  }

  function receive(packet) {
    if (!packet || Number(packet.protocol) !== CREW_PROTOCOL || cleanRoom(packet.room) !== room || !room) return false;
    const sender = cleanId(packet.sender);
    if (!sender || sender === id) return false;
    const at = finite(now());

    if (packet.kind === 'crew-hello') return acceptHello(packet, at);
    if (packet.kind === 'crew-welcome') return acceptWelcome(packet, at);
    if (packet.kind === 'crew-members') return acceptMembers(packet, at);
    if (packet.kind === 'crew-deny' && mode === 'guest' && cleanId(packet.target) === id) {
      lastEvent = `denied:${String(packet.reason || 'unknown')}`;
      return true;
    }
    if (packet.kind === 'crew-leave') {
      peers.delete(sender); replication.remove(sender);
      if (mode === 'host') emit({ kind: 'crew-members', members: peerList() });
      if (sender === hostId && mode === 'guest') { seat = -1; lastEvent = 'host-left'; }
      return true;
    }
    if (packet.kind === 'crew-heartbeat') {
      const peer = peers.get(sender);
      if (peer) peers.set(sender, { ...peer, lastSeen: at });
      return Boolean(peer);
    }
    if (packet.kind === 'crew-pose') {
      if (mode === 'host' && !peers.has(sender)) return false;
      if (mode === 'guest' && seat < 0) return false;
      const peer = peers.get(sender);
      if (peer) peers.set(sender, { ...peer, lastSeen: at });
      return replication.receive({ ...packet, id: sender, at: finite(packet.at, at) });
    }
    return false;
  }

  function prune(at) {
    let changed = false;
    for (const [peerId, peer] of peers) {
      if (at - peer.lastSeen <= staleAfter) continue;
      peers.delete(peerId); replication.remove(peerId); changed = true;
      if (peerId === hostId && mode === 'guest') { seat = -1; lastEvent = 'host-timeout'; }
    }
    if (changed && mode === 'host') emit({ kind: 'crew-members', members: peerList() });
  }

  function update(pose, at = now()) {
    const t = finite(at);
    if (mode === 'offline' || !room) return status();
    prune(t);

    if (mode === 'guest' && seat < 0 && t - lastHelloAt >= 1) {
      emit({ kind: 'crew-hello', requestedSeat: null });
      lastHelloAt = t;
    }
    if (t - lastHeartbeatAt >= 2) {
      emit({ kind: 'crew-heartbeat', seat });
      lastHeartbeatAt = t;
    }
    if ((mode === 'host' || seat > 0) && t >= nextPoseAt) {
      const local = replication.localPacket(pose, t);
      if (local) emit({ ...local, sender: id });
      nextPoseAt = t + 1 / CREW_POSE_HZ;
    }
    return status();
  }

  return Object.freeze({
    host,
    join,
    leave,
    receive,
    update,
    status,
    renderSamples: (at = now(), interpolationDelay = .1) => replication.renderSamples(finite(at), interpolationDelay),
    replicationSnapshot: replication.snapshot,
  });
}
