import { createCrewSession, CREW_PROTOCOL } from './crew-session.js';
import { createMamuteCommandAuthority, MAMUTE_COMMAND_STATION } from './mamute-command-authority.js';

const cleanId = value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null;
const EFFECT_TYPES = new Set(['fire', 'reload', 'impact', 'critical', 'repair', 'extinguisher']);

/**
 * Thin glue between the transport adapter and the Mamute crew session.
 * `transportFactory({room,faction,onMessage})` must return {start,send,close,kind}.
 *
 * Networking remains outside render/input code. The runtime owns only transport
 * routing, crew/session replication, shared crew effects and host-authoritative
 * Mamute commands.
 */
export function createCrewRuntime({
  localId,
  transportFactory,
  now = () => performance.now() / 1000,
  onStatus = () => {},
  applyMamuteCommand = () => true,
  mamuteSnapshot = () => null,
  onMamuteState = () => {},
  onCommandResult = () => {},
  onEffect = () => {},
} = {}) {
  const id = cleanId(localId) || 'local';
  let transport = null;
  let lastStatus = null;
  let localCommandSeq = 0;
  let localEffectSeq = 0;
  const seenEffects = new Map();

  const session = createCrewSession({
    localId: id,
    now,
    send: packet => transport?.send?.(packet),
  });

  const commandAuthority = createMamuteCommandAuthority({
    stationOwner: station => session.stationOwner(station),
    apply: command => applyMamuteCommand(command),
  });

  const publish = () => {
    const base = session.status();
    lastStatus = Object.freeze({ ...base, transport: transport?.kind || 'none', transportActive: Boolean(transport?.active) });
    try { onStatus(lastStatus); } catch {}
    return lastStatus;
  };

  const roomMatches = packet => {
    const status = session.status();
    return Boolean(status.room)
      && Number(packet?.protocol) === CREW_PROTOCOL
      && String(packet?.room || '') === status.room
      && packet?.faction === status.faction
      && cleanId(packet?.sender) !== id;
  };

  function notifyCommandResult(result, packet) {
    try { onCommandResult(result, packet); } catch {}
    return result;
  }

  function emitMamuteState(reason = 'command') {
    const status = session.status();
    if (status.mode !== 'host' || !status.room || !transport?.send) return false;
    let snapshot = null;
    try { snapshot = mamuteSnapshot(); } catch { snapshot = null; }
    if (snapshot == null) return false;
    try {
      transport.send({
        kind: 'mamute-state',
        protocol: CREW_PROTOCOL,
        room: status.room,
        faction: status.faction,
        sender: id,
        sentAt: Number(now()) || 0,
        reason,
        state: snapshot,
      });
      return true;
    } catch {
      return false;
    }
  }

  function emitEffect(type, payload = null) {
    const status = session.status();
    const effectType = String(type || '');
    if (!EFFECT_TYPES.has(effectType)) return Object.freeze({ ok: false, reason: 'invalid-effect' });
    const event = Object.freeze({
      kind: 'crew-effect',
      protocol: CREW_PROTOCOL,
      room: status.room,
      faction: status.faction,
      sender: id,
      sentAt: Number(now()) || 0,
      seq: ++localEffectSeq,
      type: effectType,
      payload,
    });
    if (status.mode === 'offline') return Object.freeze({ ok: true, localOnly: true, event });
    if (!status.room || !transport?.send) return Object.freeze({ ok: false, reason: 'not-connected', event });
    try {
      transport.send(event);
      return Object.freeze({ ok: true, event });
    } catch {
      return Object.freeze({ ok: false, reason: 'transport-send-failed', event });
    }
  }

  function acceptCrewEffect(packet) {
    if (!roomMatches(packet) || !EFFECT_TYPES.has(String(packet.type || ''))) return false;
    const status = session.status();
    const sender = cleanId(packet.sender);
    if (!sender || !status.peers.some(peer => peer.id === sender)) return false;
    const seq = Number(packet.seq);
    if (!Number.isFinite(seq) || seq < 0) return false;
    const last = seenEffects.get(sender) ?? -1;
    if (seq <= last) return false;
    seenEffects.set(sender, seq);
    const event = Object.freeze({ sender, type: String(packet.type), payload: packet.payload ?? null, sentAt: Number(packet.sentAt) || 0, seq });
    try { onEffect(event, packet); } catch {}
    return true;
  }

  function acceptMamuteCommand(packet) {
    const status = session.status();
    if (status.mode !== 'host' || !roomMatches(packet)) return false;
    const sender = cleanId(packet.sender);
    if (!sender || !status.peers.some(peer => peer.id === sender)) return false;
    const result = commandAuthority.receive({
      playerId: sender,
      seq: packet.seq,
      type: packet.type,
      payload: packet.payload,
    });
    notifyCommandResult(result, packet);
    if (result.ok) emitMamuteState(packet.type || 'command');
    return true;
  }

  function acceptMamuteState(packet) {
    const status = session.status();
    if (status.mode !== 'guest' || !roomMatches(packet) || cleanId(packet.sender) !== status.hostId) return false;
    try { onMamuteState(packet.state, packet); } catch {}
    return true;
  }

  function acceptTransportPacket(packet) {
    if (packet?.kind === 'mamute-command') return acceptMamuteCommand(packet);
    if (packet?.kind === 'mamute-state') return acceptMamuteState(packet);
    if (packet?.kind === 'crew-effect') return acceptCrewEffect(packet);

    const before = new Set(session.status().peers.map(peer => peer.id));
    const accepted = session.receive(packet);
    if (accepted) {
      const after = new Set(session.status().peers.map(peer => peer.id));
      for (const peerId of before) if (!after.has(peerId)) {
        commandAuthority.resetPlayer(peerId);
        seenEffects.delete(peerId);
      }
      publish();
    }
    return accepted;
  }

  function disconnect(reason = 'left') {
    if (session.status().mode !== 'offline') session.leave(reason);
    try { transport?.close?.(); } catch {}
    transport = null;
    localCommandSeq = 0;
    localEffectSeq = 0;
    seenEffects.clear();
    commandAuthority.resetPlayer(id);
    return publish();
  }

  function connect(mode, room, faction) {
    disconnect('switch-room');
    if (typeof transportFactory !== 'function') return Object.freeze({ ok: false, reason: 'transport-unavailable', status: publish() });
    let candidate;
    try {
      candidate = transportFactory({ room, faction, onMessage: acceptTransportPacket });
    } catch {
      return Object.freeze({ ok: false, reason: 'transport-create-failed', status: publish() });
    }
    if (!candidate?.start?.() || typeof candidate.send !== 'function') {
      try { candidate?.close?.(); } catch {}
      return Object.freeze({ ok: false, reason: 'transport-start-failed', status: publish() });
    }
    transport = candidate;
    try {
      mode === 'host' ? session.host(room, faction) : session.join(room, faction);
    } catch {
      try { transport.close?.(); } catch {}
      transport = null;
      return Object.freeze({ ok: false, reason: 'invalid-room-or-faction', status: publish() });
    }
    return Object.freeze({ ok: true, status: publish() });
  }

  function update(localPose, at = now()) {
    session.update(localPose, at);
    return publish();
  }

  function claimStation(station) {
    const result = session.claimStation(station);
    publish();
    return result;
  }

  function releaseStation(station) {
    const result = session.releaseStation(station);
    publish();
    return result;
  }

  /**
   * Issue a physical Mamute command from the local player's currently-owned
   * station. Host/offline commands are applied locally through the same
   * authority used for remote commands. Guest commands are sent to the host;
   * they never directly mutate local camera/input/game state.
   */
  function issueCommand(type, payload = null) {
    const station = MAMUTE_COMMAND_STATION[String(type)];
    const status = session.status();
    if (!station) return notifyCommandResult(Object.freeze({ ok: false, reason: 'invalid-command-type' }), null);
    if (session.stationOwner(station) !== id) {
      return notifyCommandResult(Object.freeze({ ok: false, reason: 'station-not-owned', station, owner: session.stationOwner(station) }), null);
    }

    const seq = ++localCommandSeq;
    const command = Object.freeze({ playerId: id, seq, type: String(type), payload });

    if (status.mode === 'offline' || status.mode === 'host') {
      const result = commandAuthority.receive(command);
      notifyCommandResult(result, command);
      if (result.ok && status.mode === 'host') emitMamuteState(type);
      return result;
    }

    if (status.mode !== 'guest' || !status.connected || !transport?.send) {
      return notifyCommandResult(Object.freeze({ ok: false, reason: 'not-connected', station }), command);
    }

    const packet = Object.freeze({
      kind: 'mamute-command',
      protocol: CREW_PROTOCOL,
      room: status.room,
      faction: status.faction,
      sender: id,
      sentAt: Number(now()) || 0,
      seq,
      type: String(type),
      payload,
    });
    try {
      transport.send(packet);
      return notifyCommandResult(Object.freeze({ ok: true, pending: true, reason: 'sent-to-host', station, seq }), packet);
    } catch {
      return notifyCommandResult(Object.freeze({ ok: false, reason: 'transport-send-failed', station, seq }), packet);
    }
  }

  return Object.freeze({
    host: (room, faction) => connect('host', room, faction),
    join: (room, faction) => connect('guest', room, faction),
    disconnect,
    update,
    claimStation,
    releaseStation,
    issueCommand,
    emitEffect,
    emitMamuteState,
    canUseStation: station => session.canUseStation(station),
    stationOwner: station => session.stationOwner(station),
    stationSnapshot: session.stationSnapshot,
    receive: acceptTransportPacket,
    renderSamples: (at = now(), delay = .1) => session.renderSamples(at, delay),
    status: () => lastStatus || publish(),
    sessionStatus: session.status,
    commandSnapshot: commandAuthority.snapshot,
  });
}
