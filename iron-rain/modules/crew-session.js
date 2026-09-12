import { createCrewReplication } from './crew-replication.js';
import { createCrewStationAuthority } from './crew-station-authority.js';
import { FACTIONS, normalizeFaction } from './factions.js';

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
 * A Mamute belongs to exactly one faction: Allies or Axis. Opposing players can
 * share the theatre but can never join the same vehicle/session.
 * Compact validated crew poses are replicated; remote input never reaches the
 * local movement/camera controller. Physical stations are host-authoritative so
 * two players cannot operate the same wheel, driver controls or service point.
 */
export function createCrewSession({
  localId = 'local',
  send = () => {},
  now = () => performance.now() / 1000,
  staleAfter = 6,
} = {}) {
  const id = cleanId(localId) || 'local';
  const staleSeconds = Math.max(.5, finite(staleAfter, 6));
  const replication = createCrewReplication({ localId: id, capacity: CREW_MAX_PLAYERS, staleAfter: staleSeconds });
  const stations = createCrewStationAuthority();
  const peers = new Map();
  let mode = 'offline';
  let room = '';
  let faction = null;
  let seat = 0;
  let hostId = null;
  let nextPoseAt = 0;
  let lastHelloAt = -Infinity;
  let lastHeartbeatAt = -Infinity;
  let lastEvent = 'offline';

  const emit = payload => {
    const packet = Object.freeze({ ...payload, protocol: CREW_PROTOCOL, room, faction, sender: id, sentAt: finite(now()) });
    try { send(packet); } catch { /* transport loss must not break gameplay */ }
    return packet;
  };

  function peerList() {
    return Object.freeze([...peers.values()].sort((a, b) => a.seat - b.seat).map(peer => Object.freeze({ ...peer })));
  }

  function stationState() { return stations.snapshot(); }

  function status() {
    return Object.freeze({
      mode,
      room,
      faction,
      localId: id,
      hostId,
      seat,
      connected: mode === 'host' || (mode === 'guest' && seat > 0),
      count: mode === 'offline' ? 1 : 1 + peers.size,
      capacity: CREW_MAX_PLAYERS,
      peers: peerList(),
      stations: stationState(),
      lastEvent,
    });
  }

  function broadcastStations() {
    if (mode === 'host' && room) emit({ kind: 'crew-stations', state: stationState() });
  }

  function reset(nextMode = 'offline', nextRoom = '', nextFaction = faction) {
    peers.clear();
    replication.clear();
    stations.clear();
    mode = nextMode;
    room = cleanRoom(nextRoom);
    faction = normalizeFaction(nextFaction, nextMode === 'offline' ? null : FACTIONS.ALLIES);
    seat = nextMode === 'host' ? 0 : -1;
    hostId = nextMode === 'host' ? id : null;
    nextPoseAt = 0;
    lastHelloAt = lastHeartbeatAt = -Infinity;
    lastEvent = nextMode;
  }

  function host(roomCode, factionChoice = FACTIONS.ALLIES) {
    reset('host', roomCode, factionChoice);
    if (!room) throw new RangeError('room code required');
    if (!faction) throw new RangeError('faction required');
    lastEvent = 'hosting';
    emit({ kind: 'crew-host-open', seat: 0, capacity: CREW_MAX_PLAYERS });
    return status();
  }

  function join(roomCode, factionChoice = FACTIONS.ALLIES) {
    reset('guest', roomCode, factionChoice);
    if (!room) throw new RangeError('room code required');
    if (!faction) throw new RangeError('faction required');
    lastEvent = 'joining';
    emit({ kind: 'crew-hello', requestedSeat: null });
    lastHelloAt = finite(now());
    return status();
  }

  function leave(reason = 'left') {
    const previousFaction = faction;
    if (mode !== 'offline' && room) emit({ kind: 'crew-leave', reason: String(reason).slice(0, 48), seat });
    reset('offline', '', previousFaction);
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
    const requestedFaction = normalizeFaction(packet.faction, FACTIONS.ALLIES);
    if (requestedFaction !== faction) {
      emit({ kind: 'crew-deny', target: peerId, reason: 'faction-mismatch' });
      lastEvent = `join-denied-faction:${peerId}`;
      return true;
    }
    const existing = peers.get(peerId);
    const assignedSeat = existing?.seat ?? allocateSeat();
    if (assignedSeat == null) {
      emit({ kind: 'crew-deny', target: peerId, reason: 'mamute-full' });
      lastEvent = 'join-denied-full';
      return true;
    }
    peers.set(peerId, { id: peerId, seat: assignedSeat, lastSeen: at });
    emit({ kind: 'crew-welcome', target: peerId, hostId: id, seat: assignedSeat, capacity: CREW_MAX_PLAYERS, members: peerList(), stations: stationState() });
    emit({ kind: 'crew-members', members: peerList() });
    broadcastStations();
    lastEvent = `joined:${peerId}`;
    return true;
  }

  function acceptWelcome(packet, at) {
    if (mode !== 'guest' || cleanId(packet.target) !== id) return false;
    if (normalizeFaction(packet.faction, FACTIONS.ALLIES) !== faction) return false;
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
    if (packet.stations) stations.apply(packet.stations);
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

  function acceptStationRequest(packet) {
    if (mode !== 'host') return false;
    const sender = cleanId(packet.sender);
    if (!sender || !peers.has(sender)) return false;
    const result = stations.claim(packet.station, sender);
    if (result.ok) {
      lastEvent = `station:${result.station}:${sender}`;
      broadcastStations();
    } else {
      emit({ kind: 'crew-station-deny', target: sender, station: packet.station, owner: result.owner, reason: result.reason });
      lastEvent = `station-denied:${String(packet.station || '')}`;
    }
    return true;
  }

  function acceptStationRelease(packet) {
    if (mode !== 'host') return false;
    const sender = cleanId(packet.sender);
    if (!sender || !peers.has(sender)) return false;
    const changed = stations.release(packet.station, sender);
    if (changed) broadcastStations();
    return true;
  }

  function receive(packet) {
    if (!packet || Number(packet.protocol) !== CREW_PROTOCOL || cleanRoom(packet.room) !== room || !room) return false;
    const sender = cleanId(packet.sender);
    if (!sender || sender === id) return false;
    const at = finite(now());

    if (packet.kind === 'crew-hello') return acceptHello(packet, at);
    if (packet.kind === 'crew-deny' && mode === 'guest' && cleanId(packet.target) === id) {
      lastEvent = `denied:${String(packet.reason || 'unknown')}`;
      return true;
    }
    if (packet.kind === 'crew-welcome') return acceptWelcome(packet, at);
    if (normalizeFaction(packet.faction, FACTIONS.ALLIES) !== faction) return false;
    if (packet.kind === 'crew-members') return acceptMembers(packet, at);
    if (packet.kind === 'crew-station-request') return acceptStationRequest(packet);
    if (packet.kind === 'crew-station-release') return acceptStationRelease(packet);
    if (packet.kind === 'crew-stations' && mode === 'guest' && sender === hostId) {
      const accepted = stations.apply(packet.state);
      if (accepted) lastEvent = 'stations-updated';
      return accepted;
    }
    if (packet.kind === 'crew-station-deny' && mode === 'guest' && cleanId(packet.target) === id) {
      lastEvent = `station-denied:${String(packet.station || '')}:${String(packet.owner || '')}`;
      return true;
    }
    if (packet.kind === 'crew-leave') {
      peers.delete(sender); replication.remove(sender);
      const stationChanged = stations.releaseAll(sender) > 0;
      if (mode === 'host') {
        emit({ kind: 'crew-members', members: peerList() });
        if (stationChanged) broadcastStations();
      }
      if (sender === hostId && mode === 'guest') { seat = -1; stations.clear(); lastEvent = 'host-left'; }
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
      // performance.now() clocks are local to each device and are not
      // comparable across phones/PCs. Normalize every remote pose to the local
      // receipt clock before interpolation; sender timestamps remain diagnostic.
      return replication.receive({ ...packet, id: sender, at });
    }
    return false;
  }

  function prune(at) {
    let changed = false, stationChanged = false;
    for (const [peerId, peer] of peers) {
      if (at - peer.lastSeen <= staleSeconds) continue;
      peers.delete(peerId); replication.remove(peerId); changed = true;
      stationChanged = stations.releaseAll(peerId) > 0 || stationChanged;
      if (peerId === hostId && mode === 'guest') { seat = -1; stations.clear(); lastEvent = 'host-timeout'; }
    }
    if (changed && mode === 'host') emit({ kind: 'crew-members', members: peerList() });
    if (stationChanged && mode === 'host') broadcastStations();
  }

  function claimStation(station) {
    if (mode === 'offline') return stations.claim(station, id);
    if (mode === 'host') {
      const result = stations.claim(station, id);
      if (result.ok) broadcastStations();
      lastEvent = result.ok ? `station:${result.station}:${id}` : `station-denied:${String(station || '')}`;
      return result;
    }
    if (seat < 0) return Object.freeze({ ok: false, reason: 'not-connected', station, owner: null, revision: stationState().revision });
    if (stations.ownerOf(station) === id) return Object.freeze({ ok: true, reason: 'already-owned', station, owner: id, revision: stationState().revision });
    emit({ kind: 'crew-station-request', station });
    lastEvent = `station-request:${String(station || '')}`;
    return Object.freeze({ ok: false, pending: true, reason: 'pending-host', station, owner: stations.ownerOf(station), revision: stationState().revision });
  }

  function releaseStation(station) {
    if (mode === 'offline') return stations.release(station, id);
    if (mode === 'host') {
      const changed = stations.release(station, id);
      if (changed) broadcastStations();
      return changed;
    }
    if (seat < 0 || stations.ownerOf(station) !== id) return false;
    emit({ kind: 'crew-station-release', station });
    return true;
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
    claimStation,
    releaseStation,
    stationOwner: station => stations.ownerOf(station),
    canUseStation: station => stations.canUse(station, id),
    stationSnapshot: stationState,
    renderSamples: (at = now(), interpolationDelay = .1) => replication.renderSamples(finite(at), interpolationDelay),
    replicationSnapshot: replication.snapshot,
  });
}
