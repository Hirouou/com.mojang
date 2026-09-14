import { createCrewReplication } from './crew-replication.js';

/** Client adapter: pose/presentation only. Commands execute exclusively on the backend. */
export function createServerCrewRuntime({ endpoint, storage = globalThis.localStorage, fetcher = globalThis.fetch, onStatus = () => {} } = {}) {
  const base = String(endpoint || '').replace(/\/$/, '');
  let token = '', id = '', connected = false, snapshot = null, lastEvent = '', pose = null, exteriorPose = null, replication = null;
  let timer = null, stopped = false, after = null, polling = false, sending = false;
  const queue = [];
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
    // Delta snapshots omit unchanged, comparatively large world sections.
    next = { ...snapshot, ...next };
    snapshot = next; connected = true;
    sequence = Math.max(sequence, next.sequence || 0);
    const currentIds = new Set(next.peers.filter(p => !p.exterior).map(p => p.id));
    for (const remote of replication.snapshot().remotes) if (!currentIds.has(remote.id)) replication.remove(remote.id);
    for (const peer of next.peers) if (peer.id !== id && !peer.exterior) replication.receive({ kind: 'crew-pose', id: peer.id, seq: next.revision, at: performance.now()/1000, pose: peer.pose, station:peer.station });
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
    try { const next = await post('/poll', { pose, exteriorPose, ...(after === null ? {} : { after }), strategicSince: snapshot?.strategicRevision }); if (!next.ok) throw new Error(next.reason); accept(next); }
    catch (error) { connected = false; lastEvent = error.message; publish(); }
    finally { polling = false; }
  }
  const continuous = type => type === 'drive-vector' || type === 'aim-delta';
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const compatibleAim = (a, b) => ['bearing', 'elevation'].every(key => !a[key] || !b[key] || Math.sign(a[key]) === Math.sign(b[key]));
  async function send(request) {
      if (!connected || stopped) return { ok: false, reason: 'not-connected' };
      // Retry exactly the same id: a lost response cannot duplicate the action.
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { response = await post('/command', { ...request, pose, exteriorPose, after, strategicSince: snapshot?.strategicRevision }); break; }
        catch (error) { if (attempt) { connected = false; lastEvent = error.message; publish(); return { ok: false, reason: lastEvent }; } }
      }
      if (stopped) return { ok: false, reason: 'disconnected' };
      accept(response.snapshot);
      for (const fn of commands) fn(response, request);
      return response;
  }
  async function drain() {
    if (sending) return;
    sending = true;
    try {
      while (queue.length) {
        const entry = queue.shift();
        // Aim remains bounded by the server's per-command safety limits. A
        // fire/reload/release barrier cannot pass any preceding aim chunks.
        let response;
        do {
          const payload = entry.type === 'aim-delta'
            ? { bearing: Math.max(-12, Math.min(12, entry.payload.bearing)), elevation: Math.max(-8, Math.min(8, entry.payload.elevation)) }
            : entry.payload;
          const request = { id: crypto.randomUUID(), type: entry.type, payload, sequence: ++sequence };
          response = await send(request);
          if (entry.type !== 'aim-delta' || !response.ok) break;
          entry.payload.bearing -= payload.bearing;
          entry.payload.elevation -= payload.elevation;
        } while (Math.abs(entry.payload.bearing) > .00001 || Math.abs(entry.payload.elevation) > .00001);
        for (const resolve of entry.waiters) resolve(response);
      }
    } finally { sending = false; }
  }
  function command(type, payload = {}) {
    if (!connected || stopped) return Promise.resolve({ ok: false, reason: 'not-connected' });
    const next = type === 'aim-delta'
      ? { bearing: finite(payload.bearing), elevation: finite(payload.elevation) }
      : { ...payload };
    return new Promise(resolve => {
      // Only unsent continuous input can be replaced. Discrete commands form
      // ordering barriers, and an in-flight request always keeps its ID/data.
      let entry = null;
      if (continuous(type)) for (let i = queue.length - 1; i >= 0; i--) {
        const candidate = queue[i];
        if (!continuous(candidate.type)) break;
        if (candidate.type !== type) continue;
        if (type === 'aim-delta' && !compatibleAim(candidate.payload, next)) break;
        entry = candidate; break;
      }
      if (entry) {
        if (type === 'aim-delta') {
          entry.payload.bearing += next.bearing; entry.payload.elevation += next.elevation;
        } else entry.payload = next;
        entry.waiters.push(resolve);
      } else queue.push({ type, payload: next, waiters: [resolve] });
      void drain();
    });
  }
  return {
    connect, command, status, isAuthoritativeClient: true,
    snapshot: () => snapshot,
    update(nextPose) { if (nextPose) pose = nextPose; return status(); },
    updateExteriorPose(nextPose) { exteriorPose = nextPose ? { ...nextPose } : null; },
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
    disconnect() {
      stopped = true; clearInterval(timer); timer = null;
      for (const entry of queue.splice(0)) for (const resolve of entry.waiters) resolve({ ok: false, reason: 'disconnected' });
      post('/leave').catch(() => {}); connected = false; publish();
    },
  };
}
