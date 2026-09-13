import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { makeTheatre } from '../modules/strategic-war-live-v3.js';
import { hexControl } from '../modules/strategic-hex-map.js';
import { controlLineX, THEATRE_SIZE } from '../modules/theatre-control.js';
import { initializeSector, updateWar, applyWarImpact, selectPlayerThreat } from '../modules/war-simulation-core.js';
import { ballistics, sampleTrajectory, bearingVector } from '../modules/ballistics.js';
import { beginLoading, stepLoading } from '../modules/loading-cycle.js';
import { createEngine, damageEngine, engineCanDrive, serviceEngine, updateEngine } from '../modules/engine-system.js';
import { CABIN_STATIONS, cabinCrewPose } from '../modules/cabin-controls.js';
import { MAMUTE_COMMAND_STATION } from '../modules/mamute-command-authority.js';

const hash = token => createHash('sha256').update(String(token)).digest('hex');
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
const teamOf = faction => faction === 'axis' ? 'enemy' : 'ally';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fail = reason => ({ ok: false, reason });
const validFaction = faction => ['allies', 'axis'].includes(faction);
const stationDefinition = id => CABIN_STATIONS.find(station => station.id === id);
export const MAX_MAMUTE_CREW = 3;
const PRESENCE_LEASE_MS = 8000;
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function createWarAuthority({ store, now = Date.now } = {}) {
  const saved = store.load();
  if (saved && saved.schema !== 1) throw new Error('Unsupported world schema; refusing to reset persisted war');
  const theatre = makeTheatre(saved?.strategic);
  const allSectors = theatre.hexes.flatMap(hex => hex.sectors.map(sector => ({ ...sector, hexId: hex.id, hexName: hex.name })));
  const fronts = [], used = new Set();
  for (let index = 0; index < 7; index++) {
    const y = THEATRE_SIZE.h * (index + .5) / 7;
    const selected = allSectors.filter(s => !used.has(s.id)).sort((a, b) =>
      (Math.abs(a.x-controlLineX(a.y))*1.8 + Math.abs(a.y-y)*.55) - (Math.abs(b.x-controlLineX(b.y))*1.8 + Math.abs(b.y-y)*.55))[0];
    fronts.push(selected); used.add(selected.id);
  }
  const state = saved || {
    schema: 1, theatreId: 'IRON-RAIN-01', epoch: now(), wallMs: now(), time: 0, revision: 0, serial: 0,
    players: {}, mamutes: {}, events: [], wind: { x: 2, y: -.5 }, strategic: null,
    battlefield: { time: 0, paused: false, mode: 'server', robot: { x: -100000, y: -100000, armor: 100 }, cam: { x: 40000, y: 30000 },
      sectors: fronts.map((sector, index) => initializeSector({ id: index, strategicId: sector.id, name: `${sector.hexName} / ${sector.name}`, x: sector.x, y: sector.y, assets: [], units: [], allyStrength: 68, enemyStrength: 68 }, index)),
      tracers: [], effects: [], smokes: [], craters: [], reports: [], warSimulation: { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0, events: [], support: [], serial: 0 } },
  };
  const online = new Map();
  // Presence is leased, not persisted ownership. A restarted server never leaves
  // a disconnected browser in charge of a station or with its accelerator held.
  for (const mamute of Object.values(state.mamutes)) { mamute.stations = {}; mamute.drive = { x: 0, y: 0 }; mamute.extinguisherOwner = null; mamute.serviceOwner = null; mamute.hullRepair = null; mamute.engine.hasExtinguisher = false; mamute.engine.action = null; }
  let strategicAcc = 0, lastSave = now();
  function save() { state.strategic = theatre.snapshot(); store.save(state); lastSave = now(); }
  function event(type, mamute, payload = {}) {
    const entry = { id: ++state.serial, type, mamuteId: mamute?.id || null, time: state.time, payload };
    state.events.push(entry); state.events = state.events.slice(-256); return entry;
  }
  function identify(token) { return typeof token === 'string' && token.length >= 32 && token.length <= 128 ? Object.values(state.players).find(player => player.tokenHash === hash(token)) : null; }
  function authenticate(token) {
    // Authentication does not reserve a crew slot. Presence must first pass the
    // capacity check; reconnect cannot evict a player who already occupies it.
    return identify(token) || null;
  }
  function register() {
    if (Object.keys(state.players).length >= 2000) return fail('server-capacity');
    const token = randomBytes(32).toString('base64url'), id = randomUUID();
    state.players[id] = { id, tokenHash: hash(token), faction: null, mamuteId: null, sequence: 0, receipts: {} };
    save(); return { ok: true, playerId: id, token, theatreId: state.theatreId };
  }
  const occupied = m => Object.values(state.players).filter(p => p.mamuteId === m.id && online.has(p.id) && now()-online.get(p.id).at < PRESENCE_LEASE_MS);
  const near = (player, station) => {
    const pose = online.get(player.id)?.pose, def = stationDefinition(station);
    return Boolean(pose && def && Math.hypot(pose.x - def.x, pose.z - def.z) <= def.radius + .25);
  };
  function release(player) {
    const m = state.mamutes[player.mamuteId];
    if (!m) return;
    for (const [station, owner] of Object.entries(m.stations)) if (owner === player.id) delete m.stations[station];
    if (m.serviceOwner === player.id) { m.engine.action = null; m.serviceOwner = null; }
    if (m.hullRepair?.owner === player.id) m.hullRepair = null;
    if (m.extinguisherOwner === player.id) { m.extinguisherOwner = null; m.engine.hasExtinguisher = false; }
    if (!m.stations.drive) m.drive = { x: 0, y: 0 };
  }
  function disconnect(player) { release(player); online.delete(player.id); save(); }
  function expirePresence() {
    for (const [id, presence] of online) if (now()-presence.at >= PRESENCE_LEASE_MS) { release(state.players[id]); online.delete(id); }
  }
  const spawn = (faction, id) => theatre.hexes.find(hex => (!id || hex.id === id) && hexControl(hex) === teamOf(faction));
  function createMamute(player, payload) {
    if (!validFaction(payload.faction) || (player.faction && player.faction !== payload.faction)) return fail('faction-mismatch');
    const origin = spawn(payload.faction, payload.spawnId);
    if (!origin) return fail('invalid-spawn');
    if (Object.keys(state.mamutes).length >= 100) return fail('theatre-capacity');
    release(player);
    const id = randomUUID(), ordinal = Object.keys(state.mamutes).length;
    // A shuffled two-digit series remains collision-free, then extends naturally.
    const name = `M${ordinal < 90 ? 10 + (ordinal * 37 + 64) % 90 : 100 + ordinal - 90}`;
    const m = { id, name, code: randomBytes(5).toString('hex').toUpperCase(), faction: payload.faction, spawnId: origin.id,
      robot: { x: origin.x, y: origin.y, armor: 100, facing: payload.faction === 'axis' ? Math.PI : 0, turret: 0, speed: 0, recoil: 0 },
      bearing: payload.faction === 'axis' ? 270 : 90, elev: 45, charge: 4, selectedShell: 'HE', loadedShell: 'HE',
      ammo: { HE: 18, FRAG: 8, SMOKE: 8 }, engine: createEngine(), stations: {}, drive: { x: 0, y: 0 }, driveUntil: 0,
      loading: null, projectile: null, extinguisherOwner: null, serviceOwner: null, destroyed: false, respawnAt: null, hatchOpen: false, threatAt: 0 };
    state.mamutes[id] = m; player.faction = payload.faction; player.mamuteId = id;
    event('created', m, { name }); return { ok: true, mamuteId: id, code: m.code };
  }
  function join(player, payload) {
    const m = payload.mamuteId ? state.mamutes[payload.mamuteId] : Object.values(state.mamutes).find(m => m.code === String(payload.code || '').toUpperCase());
    if (!m) return fail('mamute-not-found');
    if (m.faction !== payload.faction || (player.faction && player.faction !== m.faction)) return fail('faction-mismatch');
    if (occupied(m).filter(p => p.id !== player.id).length >= MAX_MAMUTE_CREW) return fail('crew-full');
    release(player); player.mamuteId = m.id; player.faction = m.faction; return { ok: true, mamuteId: m.id, code: m.code };
  }
  function damage(m, amount, source = {}) {
    if (m.destroyed || !Number.isFinite(amount) || amount <= 0) return;
    const loss = Math.min(m.robot.armor, amount); m.robot.armor -= loss;
    damageEngine(m.engine, loss);
    event(m.robot.armor <= 30 ? 'critical' : 'impact', m, { damage: loss, armor: m.robot.armor, ...source });
    if (m.robot.armor <= 0) {
      m.destroyed = true; m.respawnAt = state.time + 15; m.drive = { x: 0, y: 0 }; m.stations = {}; m.serviceOwner = null;
      event('destroyed', m, { respawnAt: m.respawnAt });
    }
  }
  function apply(player, type, p = {}) {
    if (type === 'select-faction') {
      if (!validFaction(p.faction) || (player.faction && player.faction !== p.faction)) return fail('faction-mismatch');
      player.faction = p.faction; return { ok: true, faction: p.faction };
    }
    if (type === 'create') return createMamute(player, p);
    if (type === 'join') return join(player, p);
    const m = state.mamutes[player.mamuteId];
    if (!m) return fail('no-mamute');
    if (type === 'release') { release(player); return { ok: true }; }
    if (type === 'respawn') {
      if (!m.destroyed || state.time < m.respawnAt) return fail('respawn-not-ready');
      const origin = spawn(m.faction, p.spawnId || m.spawnId); if (!origin) return fail('invalid-spawn');
      Object.assign(m.robot, { x: origin.x, y: origin.y, armor: 100, speed: 0 }); m.engine = createEngine(); m.destroyed = false;
      m.loading = null; m.extinguisherOwner = null; m.serviceOwner = null; m.hullRepair = null; m.respawnAt = null; m.spawnId = origin.id; event('respawn', m, { spawnId: origin.id }); return { ok: true };
    }
    if (m.destroyed) return fail('mamute-destroyed');
    if (type === 'claim') {
      const def = stationDefinition(p.station); if (!def || !near(player, p.station)) return fail('station-out-of-reach');
      const owner = m.stations[p.station]; if (owner && owner !== player.id) return fail('station-owned-by-other');
      // Moving between physical posts releases only this player's old post.
      for (const [key, id] of Object.entries(m.stations)) if (id === player.id) delete m.stations[key];
      if (!m.stations.drive) m.drive = { x: 0, y: 0 };
      m.stations[p.station] = player.id; return { ok: true, owner: player.id, station: p.station };
    }
    if (type === 'extinguisher' || type === 'use-extinguisher') {
      if (!near(player, 'extinguisher')) return fail('station-out-of-reach');
      if (m.extinguisherOwner && m.extinguisherOwner !== player.id) return fail('extinguisher-in-use');
      m.extinguisherOwner = m.extinguisherOwner === player.id ? null : player.id;
      m.engine.hasExtinguisher = Boolean(m.extinguisherOwner); event('extinguisher', m, { equipped: Boolean(m.extinguisherOwner) }); return { ok: true };
    }
    if (type === 'engine-service') {
      if (!near(player, 'engine')) return fail('station-out-of-reach');
      if (m.serviceOwner && m.serviceOwner !== player.id && (m.engine.action || m.hullRepair)) return fail('station-owned-by-other');
      if (m.engine.fire > 0 && m.extinguisherOwner !== player.id) return fail('needs-extinguisher');
      const result = serviceEngine(m.engine, 'engine'); m.serviceOwner = player.id;
      if (result.kind === 'ready' && m.robot.armor < 100) m.hullRepair = { elapsed: 0, owner: player.id };
      event('repair', m, { result }); return { ok: true, result };
    }
    const station = MAMUTE_COMMAND_STATION[type];
    if (!station || m.stations[station] !== player.id) return fail('station-not-claimed');
    if (type === 'drive-vector' || type === 'drive-stop') {
      const x = type === 'drive-stop' ? 0 : clamp(p.x, -1, 1), y = type === 'drive-stop' ? 0 : clamp(p.y, -1, 1), n = Math.max(1, Math.hypot(x, y));
      m.drive = { x: x/n, y: y/n }; m.driveUntil = state.time + .75;
    } else if (type === 'aim-delta') {
      m.bearing = ((m.bearing + clamp(p.bearing, -12, 12)) % 360 + 360) % 360; m.elev = clamp(m.elev + clamp(p.elevation, -8, 8), 15, 80);
    } else if (type === 'change-charge') m.charge = clamp(m.charge + Math.sign(Number(p.delta) || 0), 1, 7);
    else if (type === 'select-shell' || type === 'reload-shell') {
      if (m.loading || !['HE', 'FRAG', 'SMOKE'].includes(p.shell) || m.ammo[p.shell] <= 0) return fail('loading-unavailable');
      m.selectedShell = p.shell; m.loading = beginLoading(m.loadedShell, p.shell); event('reload', m, { from: m.loadedShell, to: p.shell });
    } else if (type === 'fire') {
      if (m.loading || m.projectile || m.ammo[m.loadedShell] <= 0) return fail('gun-not-ready');
      const solution = ballistics(m.charge, m.elev), origin = { x: m.robot.x, y: m.robot.y };
      const shell = { id: randomUUID(), solution, origin, bearing: m.bearing, wind: { ...state.wind }, type: m.loadedShell, t: 0,
        compression: clamp(solution.tof / 7, 2, 28), ...origin, z: 0 };
      m.ammo[m.loadedShell]--; m.projectile = shell; m.loading = beginLoading(m.loadedShell, m.loadedShell);
      event('fire', m, { shotId: shell.id, shell, playerId: player.id, charge: m.charge, elevation: m.elev });
    } else return fail('invalid-command');
    return { ok: true };
  }
  function command(player, request) {
    expirePresence();
    if (!player || state.players[player.id] !== player || !isRecord(request) || typeof request.id !== 'string' || request.id.length > 100 || !request.id.length || (request.payload !== undefined && !isRecord(request.payload))) return fail('invalid-command');
    if (!online.has(player.id)) return fail('presence-required');
    if (Object.hasOwn(player.receipts, request.id)) return player.receipts[request.id];
    if (!Number.isSafeInteger(request.sequence) || request.sequence <= (player.sequence || 0)) return fail('stale-command');
    player.sequence = request.sequence;
    const result = apply(player, request.type, request.payload || {});
    player.receipts[request.id] = { ...result, commandId: request.id }; const keys = Object.keys(player.receipts);
    if (keys.length > 512) delete player.receipts[keys[0]];
    state.revision++; save(); return player.receipts[request.id];
  }
  function heartbeat(player, pose) {
    expirePresence();
    if (!player || state.players[player.id] !== player) return fail('unauthorized');
    const m = state.mamutes[player.mamuteId];
    if (m && occupied(m).filter(p => p.id !== player.id).length >= MAX_MAMUTE_CREW) return fail('crew-full');
    let safe = null; try { if (pose) safe = cabinCrewPose(pose); } catch {}
    const current = online.get(player.id) || {};
    online.set(player.id, { ...current, at: now(), ...(safe ? { pose: safe } : {}) });
    return { ok: true };
  }
  function tick(dt) {
    state.time += dt; state.battlefield.time = state.time;
    const liveMamutes = Object.values(state.mamutes).filter(m => !m.destroyed);
    const focal = liveMamutes.find(m => occupied(m).length) || liveMamutes[0];
    if (focal) state.battlefield.cam = { x: focal.robot.x, y: focal.robot.y };
    updateWar(state.battlefield, dt);
    for (const smoke of state.battlefield.smokes) smoke.life -= dt;
    state.battlefield.smokes = state.battlefield.smokes.filter(smoke => smoke.life > 0);
    for (const m of liveMamutes) {
      const v = m.driveUntil > state.time && engineCanDrive(m.engine) ? m.drive : { x: 0, y: 0 };
      m.robot.speed = Math.hypot(v.x, v.y)*38; m.robot.x = clamp(m.robot.x + v.x*38*dt, 400, 79600); m.robot.y = clamp(m.robot.y + v.y*38*dt, 400, 59600);
      if (m.robot.speed) m.robot.facing = Math.atan2(v.y, v.x);
      const direction = bearingVector(m.bearing); m.robot.turret = Math.atan2(direction.y, direction.x);
      m.hatchOpen = occupied(m).some(p => { const pos = online.get(p.id)?.pose; return pos && Math.abs(pos.z - 3.67) < 1.85 && Math.abs(pos.x) < 1.05; });
      if (m.loading) { stepLoading(m.loading, dt); if (m.loading.complete) { m.loadedShell = m.loading.to; m.loading = null; } }
      const servicing = state.players[m.serviceOwner], nearEngine = Boolean(servicing && near(servicing, 'engine'));
      const serviceResult = updateEngine(m.engine, dt, { nearEngine });
      if (serviceResult) event('repair', m, { result: serviceResult });
      if (m.hullRepair) {
        const mechanic = state.players[m.hullRepair.owner];
        if (!mechanic || !near(mechanic, 'engine') || m.engine.fire) m.hullRepair = null;
        else { m.hullRepair.elapsed += dt; if (m.hullRepair.elapsed >= 6) { m.robot.armor = 100; m.hullRepair = null; event('repair', m, { hull: true }); } }
      }
      if (m.engine.fire > 0) {
        m.burnAcc = (m.burnAcc || 0) + dt;
        if (m.burnAcc >= 1) { damage(m, m.engine.fire * m.burnAcc * .5, { kind: 'fire' }); m.burnAcc = 0; }
      }
      if (state.time >= m.threatAt) {
        const threat = selectPlayerThreat({ ...state.battlefield, robot: m.robot, playerTeam: teamOf(m.faction) });
        m.threatAt = state.time + (threat?.profile.cadence || 1);
        if (threat) damage(m, (threat.profile.damage[0] + threat.profile.damage[1]) / 2, { kind: threat.kind, origin: { x: threat.source.x, y: threat.source.y } });
      }
    }
    // A fired shell stays in the world when its firing vehicle is destroyed.
    for (const m of Object.values(state.mamutes)) {
      if (m.projectile) {
        const shell = m.projectile; shell.t += dt * shell.compression;
        Object.assign(shell, sampleTrajectory(shell.solution, shell.origin, shell.bearing, shell.wind, shell.t));
        if (shell.landed) {
          applyWarImpact(state.battlefield, shell.x, shell.y, shell.type);
          for (const target of liveMamutes) {
            const radius = shell.type === 'FRAG' ? 130 : 170;
            if (shell.type !== 'SMOKE') damage(target, Math.max(0, 1 - dist(target.robot, shell)/radius) * (shell.type === 'FRAG' ? 9 : 42), { shotId: shell.id, attacker: m.id });
          }
          event('explosion', m, { shotId: shell.id, x: shell.x, y: shell.y, shell: shell.type }); m.projectile = null;
        }
      }
    }
    strategicAcc += dt;
    if (strategicAcc >= .25) { theatre.step(strategicAcc); strategicAcc = 0; }
    state.revision++;
  }
  function advance() {
    const wall = now();
    // Bounded work per turn; unprocessed time stays as debt, never silently lost.
    let remaining = Math.min(2, Math.max(0, (wall - state.wallMs)/1000));
    while (remaining > .000001) { const dt = Math.min(.1, remaining); tick(dt); state.wallMs += dt*1000; remaining -= dt; }
    expirePresence();
    if (wall - lastSave >= 1000) save();
  }
  function snapshot(player, after = state.serial) {
    expirePresence();
    after = Number.isSafeInteger(after) && after >= 0 ? after : state.serial;
    const m = state.mamutes[player.mamuteId], team = teamOf(player.faction);
    const visible = Object.values(state.mamutes).filter(item => item.faction === player.faction || (m && dist(item.robot, m.robot) < 2400));
    const peers = m ? occupied(m).map((p, seat) => ({ id: p.id, seat, pose: online.get(p.id)?.pose || { x: 0, z: 2.4, yaw: 0, pitch: 0 }, station: Object.keys(m.stations).find(key => m.stations[key] === p.id) || null })) : [];
    const sectors = m ? state.battlefield.sectors.filter(s => dist(s, m.robot) < 3500) : [];
    return structuredClone({ strategic: {hexes:theatre.hexes,territory:[...theatre.territory],logistics:theatre.logistics.snapshot()}, ok: true, authority: 'server', theatreId: state.theatreId, time: state.time, revision: state.revision, eventHead: state.serial,
      playerId: player.id, sequence: player.sequence || 0, faction: player.faction, mamute: m || null, peers, wind: state.wind, maxCrew: MAX_MAMUTE_CREW,
      lobbyMamutes: Object.values(state.mamutes).filter(v => !player.faction || v.faction === player.faction).map(v => ({ id:v.id, name:v.name, faction:v.faction, crew:occupied(v).length, capacity:MAX_MAMUTE_CREW, destroyed:v.destroyed, spawnId:v.spawnId })),
      spawnsByFaction: Object.fromEntries(['allies','axis'].map(faction => [faction,theatre.hexes.filter(hex => hexControl(hex) === teamOf(faction)).map(({id,name,x,y}) => ({id,name,x,y}))])),
      mamutes: visible.map(v => ({ id: v.id, name: v.name, faction: v.faction, robot: v.robot, destroyed: v.destroyed })),
      spawns: theatre.hexes.filter(hex => hexControl(hex) === team).map(({ id, name, x, y }) => ({ id, name, x, y })),
      sectors, tracers: m ? state.battlefield.tracers.filter(t => dist(t, m.robot) < 3500) : [],
      events: state.events.filter(e => e.id > after && (e.mamuteId === m?.id || (e.type === 'explosion' && m && dist(e.payload, m.robot) < 2400))),
    });
  }
  return { state, theatre, register, identify, authenticate, heartbeat, disconnect, command, snapshot, advance, save, damage };
}
