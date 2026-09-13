import { createCrewReplication } from './crew-replication.js';

/** Client adapter: pose/presentation only. Commands execute exclusively on the backend. */
export function createServerCrewRuntime({ endpoint, storage = globalThis.localStorage, fetcher = globalThis.fetch, onStatus = () => {} } = {}) {
  const base = String(endpoint || '').replace(/\/$/, '');
  let token = '', id = '', connected = false, snapshot = null, lastEvent = '', pose = null, replication = null;
  let timer = null, stopped = false, after = null, polling = false, queue = Promise.resolve();
  let sequence = 0;
  const effects = new Set(), snapshots = new Set(), commands = new Set(), pendingClaims = new Set();
  const key = /\.trycloudflare\.com$/.test(base) ? 'iron-rain-server-identity:IRON-RAIN-01' : `iron-rain-server-identity:${base}`;
  const status = () => ({ mode: 'server', authority: 'server', connected, localId: id, faction: snapshot?.faction, room: snapshot?.mamute?.code || '',
    mamuteId: snapshot?.mamute?.id, theatreId: snapshot?.theatreId, name: snapshot?.mamute?.name, seat: snapshot?.peers.find(p => p.id === id)?.seat || 0,
    count: snapshot?.peers.length || 1, capacity: 3, peers: (snapshot?.peers || []).filter(p => p.id !== id), lastEvent, transport: 'server-http', transportActive: connected });
  const publish = () => { onStatus(status()); return status(); };
  function accept(next) {
    if (!next?.ok || next.authority !== 'server') return;
    if (snapshot && next.revision < snapshot.revision) return;
    const first = after === null;
    snapshot = next; connected = true;
    sequence = Math.max(sequence, next.sequence || 0);
    const currentIds = new Set(next.peers.map(p => p.id));
    for (const remote of replication.snapshot().remotes) if (!currentIds.has(remote.id)) replication.remove(remote.id);
    for (const peer of next.peers) if (peer.id !== id) replication.receive({ kind: 'crew-pose', id: peer.id, seq: next.revision, at: performance.now()/1000, pose: peer.pose });
    for (const fn of snapshots) fn(next);
    if (!first) for (const event of next.events || []) if (event.id > after) {
      for (const fn of effects) fn({ ...event, seq: event.id, sender: 'server', payload: { ...event.payload, authority: 'server', mamuteId: event.mamuteId } });
    }
    after = Math.max(after || 0, next.eventHead); publish();
  }
  async function post(path, body = {}) {
    const result = await fetcher(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!result.ok) throw new Error(`server-${result.status}`);
    return result.json();
  }
  async function connect() {
    stopped = false;
    try {
      let saved; try { saved = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
      if (saved?.token) { token = saved.token; id = saved.playerId; }
      else { const identity = await post('/identity'); if (!identity.ok) throw new Error(identity.reason); token = identity.token; id = identity.playerId; storage?.setItem(key, JSON.stringify({ token, playerId: id })); }
      replication = createCrewReplication({ localId: id, staleAfter: 10 });
      await poll(); if (!connected) throw new Error(lastEvent || 'server-unavailable');
      if (!timer) timer = setInterval(poll, 200);
      return { ok: true, status: status() };
    } catch (error) { lastEvent = error.message; connected = false; publish(); return { ok: false, reason: lastEvent, status: status() }; }
  }
  async function poll() {
    if (polling || stopped || !token) return;
    polling = true;
    try { const next = await post('/poll', { pose, ...(after === null ? {} : { after }) }); if (!next.ok) throw new Error(next.reason); accept(next); }
    catch (error) { connected = false; lastEvent = error.message; publish(); }
    finally { polling = false; }
  }
  function command(type, payload = {}) {
    const request = { id: crypto.randomUUID(), type, payload, sequence: ++sequence };
    queue = queue.catch(() => {}).then(async () => {
      if (!connected) return { ok: false, reason: 'not-connected' };
      // Retry exactly the same id: a lost response cannot duplicate the action.
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { response = await post('/command', { ...request, pose, after }); break; }
        catch (error) { if (attempt) { connected = false; lastEvent = error.message; publish(); return { ok: false, reason: lastEvent }; } }
      }
      accept(response.snapshot);
      for (const fn of commands) fn(response, request);
      return response;
    });
    return queue;
  }
  return {
    connect, command, status, isAuthoritativeClient: true,
    snapshot: () => snapshot,
    update(nextPose) { if (nextPose) pose = nextPose; return status(); },
    renderSamples(at = performance.now()/1000, delay = .1) { return replication?.renderSamples(at, delay) || []; },
    stationOwner: station => connected ? snapshot?.mamute?.stations?.[station] || null : null,
    claimStation(station) {
      if (!connected) return { ok: false, reason: 'not-connected' };
      if (snapshot?.mamute?.stations?.[station] === id) return { ok: true, owner: id };
      if (!pendingClaims.has(station)) {
        pendingClaims.add(station);
        command('claim', { station }).then(result => { pendingClaims.delete(station); lastEvent = result.ok ? `station-claimed:${station}` : `station-denied:${station}`; publish(); });
      }
      return { pending: true, reason: 'pending-host' };
    },
    releaseStation() { command('release'); return true; },
    sendMamuteCommand(type, payload) { command(type, payload); return { ok: connected, pending: true }; },
    emitEffect() { return { ok: false, reason: 'server-events-only' }; },
    subscribeEffects(fn) { effects.add(fn); return () => effects.delete(fn); },
    subscribeSnapshots(fn) { snapshots.add(fn); if (snapshot) fn(snapshot); return () => snapshots.delete(fn); },
    subscribeCommands(fn) { commands.add(fn); return () => commands.delete(fn); },
    disconnect() { stopped = true; clearInterval(timer); timer = null; post('/leave').catch(() => {}); connected = false; publish(); },
  };
}
