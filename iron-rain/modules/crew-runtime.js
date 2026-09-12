import { createCrewSession } from './crew-session.js';

/**
 * Thin glue between the transport adapter and the Mamute crew session.
 * `transportFactory({room,onMessage})` must return {start,send,close,kind}.
 * The final internet transport can replace the QA BroadcastChannel adapter
 * without changing replication, renderer or local movement code.
 */
export function createCrewRuntime({
  localId,
  transportFactory,
  now = () => performance.now() / 1000,
  onStatus = () => {},
} = {}) {
  let transport = null;
  let lastStatus = null;
  const session = createCrewSession({
    localId,
    now,
    send: packet => transport?.send?.(packet),
  });

  const publish = () => {
    const base = session.status();
    lastStatus = Object.freeze({ ...base, transport: transport?.kind || 'none', transportActive: Boolean(transport?.active) });
    try { onStatus(lastStatus); } catch {}
    return lastStatus;
  };

  function disconnect(reason = 'left') {
    if (session.status().mode !== 'offline') session.leave(reason);
    try { transport?.close?.(); } catch {}
    transport = null;
    return publish();
  }

  function connect(mode, room, faction) {
    disconnect('switch-room');
    if (typeof transportFactory !== 'function') return Object.freeze({ ok: false, reason: 'transport-unavailable', status: publish() });
    let candidate;
    try {
      candidate = transportFactory({ room, faction, onMessage: packet => { if (session.receive(packet)) publish(); } });
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

  return Object.freeze({
    host: (room, faction) => connect('host', room, faction),
    join: (room, faction) => connect('guest', room, faction),
    disconnect,
    update,
    claimStation,
    releaseStation,
    canUseStation: station => session.canUseStation(station),
    stationOwner: station => session.stationOwner(station),
    stationSnapshot: session.stationSnapshot,
    receive(packet) { const accepted = session.receive(packet); if (accepted) publish(); return accepted; },
    renderSamples: (at = now(), delay = .1) => session.renderSamples(at, delay),
    status: () => lastStatus || publish(),
    sessionStatus: session.status,
  });
}
