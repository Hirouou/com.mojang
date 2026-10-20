import { createCrewReplication } from './crew-replication.js';

/** Client adapter: pose/presentation only. Commands execute exclusively on the backend. */
export function createServerCrewRuntime({ endpoint, storage = globalThis.localStorage, fetcher = globalThis.fetch, onStatus = () => {} } = {}) {
  const base = String(endpoint || '').replace(/\/$/, '');
  let token = '', id = '', connected = false, snapshot = null, lastEvent = '', pose = null, exteriorPose = null, replication = null;
  let timer = null, stopped = false, after = null, sending = false;
  let generation = 0, connectionTask = null, identityLoaded = false, renewedIdentity = false, retryDelay = 500;
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
    snapshot = next;
    if (renewedIdentity) lastEvent = 'server-identity-renewed';
    else if (!connected && lastEvent) lastEvent = 'server-reconnected';
    renewedIdentity = false; connected = true; retryDelay = 500;
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
  const active = run => !stopped && run === generation;
  const disconnected = () => ({ ok: false, reason: 'disconnected', status: status() });
  async function post(path, body = {}, credential = token) {
    const result = await fetcher(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!result.ok) throw Object.assign(new Error(`server-${result.status}`), { status: result.status, path });
    return result.json();
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (stopped) return;
    const run = generation, delay = connected ? 200 : retryDelay;
    if (!connected) retryDelay = Math.min(5000, retryDelay * 2);
    timer = setTimeout(() => { timer = null; if (active(run)) void connect(); }, delay);
  }
  function fail(error, run, credential = token) {
    if (!active(run) || credential !== token) return disconnected();
    connected = false;
    if (error.status === 401 && error.path !== '/identity') {
      // Only a rejected credential permits replacing a saved identity. A stopped
      // local server or lost response must preserve the player's Mamute/token.
      generation++; token = ''; id = ''; snapshot = null; after = null; sequence = 0;
      replication = null; renewedIdentity = true; pendingClaims.clear();
      try { storage?.removeItem?.(key); } catch {}
      for (const entry of queue.splice(0)) for (const resolve of entry.waiters) resolve({ ok: false, reason: 'server-identity-expired' });
      lastEvent = 'server-identity-expired';
    } else lastEvent = error.message;
    publish(); schedule();
    return { ok: false, reason: lastEvent, status: status() };
  }
  async function connectOnce(run) {
    try {
      if (!identityLoaded) {
        let saved; try { saved = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
        identityLoaded = true;
        if (saved?.token && saved.playerId) { token = saved.token; id = saved.playerId; }
      }
      if (!token) {
        const identity = await post('/identity', {}, '');
        if (!active(run)) return disconnected();
        if (!identity.ok || !identity.token || !identity.playerId) throw new Error(identity.reason || 'invalid-identity');
        token = identity.token; id = identity.playerId;
        try { storage?.setItem?.(key, JSON.stringify({ token, playerId: id })); } catch {}
      }
      if (!replication) replication = createCrewReplication({ localId: id, staleAfter: 10 });
      const credential = token;
      const next = await post('/poll', { pose, exteriorPose, ...(after === null ? {} : { after }), strategicSince: snapshot?.strategicRevision }, credential);
      if (!active(run) || credential !== token) return disconnected();
      if (!next.ok) throw new Error(next.reason);
      accept(next);
      if (!connected) throw new Error('invalid-server-snapshot');
      return { ok: true, status: status() };
    } catch (error) { return fail(error, run); }
  }
  function connect() {
    if (stopped) { stopped = false; generation++; }
    const run = generation;
    if (connectionTask?.run === run) return connectionTask.promise;
    clearTimeout(timer); timer = null;
    const task = { run, promise: null };
    connectionTask = task;
    task.promise = connectOnce(run).finally(() => {
      if (connectionTask === task) connectionTask = null;
      if (active(run) && timer === null) schedule();
    });
    return task.promise;
  }
  const continuous = type => type === 'drive-vector' || type === 'aim-delta';
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const compatibleAim = (a, b) => ['bearing', 'elevation'].every(key => !a[key] || !b[key] || Math.sign(a[key]) === Math.sign(b[key]));
  async function send(request) {
      if (!connected || stopped) return { ok: false, reason: 'not-connected' };
      const run = generation, credential = token;
      // Retry exactly the same id: a lost response cannot duplicate the action.
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!active(run) || credential !== token) return { ok: false, reason: 'disconnected' };
        try { response = await post('/command', { ...request, pose, exteriorPose, after, strategicSince: snapshot?.strategicRevision }, credential); break; }
        catch (error) {
          if (!active(run) || credential !== token) return { ok: false, reason: 'disconnected' };
          if (error.status === 401 || attempt) return fail(error, run, credential);
        }
      }
      if (!active(run) || credential !== token) return { ok: false, reason: 'disconnected' };
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
        const run = generation;
        command('claim', { station }).then(result => { if (!active(run)) return; pendingClaims.delete(station); lastEvent = result.ok ? `station-claimed:${station}` : `station-denied:${station}`; publish(); });
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
      stopped = true; generation++; clearTimeout(timer); timer = null; pendingClaims.clear();
      for (const entry of queue.splice(0)) for (const resolve of entry.waiters) resolve({ ok: false, reason: 'disconnected' });
      if (token) post('/leave').catch(() => {}); connected = false; publish();
    },
  };
}
